import { DEFAULT_MAPS } from '@data/defaults/maps';
import type { Duel, Game } from '@core/game/Game';
import { NO_ROOM_MODIFIERS, type RoomModifiers } from '@data/schemas/roomModifiers';
import { playBotPreparation } from '@core/players/botStrategy';
import { isAlive } from '@core/players/playerState';
import type { GameActionMessage } from '../protocol/clientMessages';
import type { MatchSetupView, ServerMessage } from '../protocol/serverMessages';
import { buildOwnView, buildPublicPlayers, toDuelView, toOutcomeView } from './playerViews';
import type { Scheduler } from './scheduler';

/** Tempo mínimo da fase de combate no servidor, para a tela conseguir mostrá-la mesmo quando o duelo acaba na hora. */
export const MINIMUM_COMBAT_PHASE_MS = 3000;

export interface MatchControllerOptions {
  readonly game: Game;
  /** Jogadores controlados por pessoas; os demais jogadores da partida são bots. */
  readonly humanIds: readonly string[];
  readonly scheduler: Scheduler;
  readonly send: (playerId: string, message: ServerMessage) => void;
  /** Entrega uma mensagem a quem só assiste. */
  readonly sendToSpectator?: (spectatorId: string, message: ServerMessage) => void;
  /** Chamado uma vez quando a partida acaba ou é abandonada. */
  readonly onEnded: () => void;
  /** Versão do conteúdo do jogo com que a partida foi criada (vai para os clientes em `match_started`). */
  readonly contentVersion?: number;
  /** Regras especiais da sala (vão para os clientes em `match_started`, para a interface calcular os mesmos valores). */
  readonly modifiers?: RoomModifiers;
  /** Mapa da partida (vai para os clientes em `match_started`). Sem ele, vale o primeiro mapa do jogo. */
  readonly mapId?: string;
}

/**
 * Dono da partida no servidor: roda o `Game` (única fonte da verdade), controla os cronômetros de cada fase e
 * entrega a cada jogador só o que ele pode ver. Quem sai (ou cai da conexão) passa a ser um bot.
 * Quem assiste recebe apenas o que é público e o duelo do jogador acompanhado, depois que a preparação fecha:
 * nunca loja, moedas, reserva, tabuleiro em montagem nem o próximo adversário.
 * Jogadores vivos podem ver a luta de outro enquanto ela acontece; os eliminados acompanham quem quiserem a qualquer
 * momento, inclusive o tabuleiro na preparação (nunca loja, moedas nem reserva).
 */
export class MatchController {
  private readonly game: Game;
  private readonly humanIds: readonly string[];
  private readonly scheduler: Scheduler;
  private readonly sendToPlayer: (playerId: string, message: ServerMessage) => void;
  private readonly sendToSpectator: (spectatorId: string, message: ServerMessage) => void;
  private readonly onEnded: () => void;
  private readonly contentVersion: number;
  private readonly modifiers: RoomModifiers;
  private readonly mapId: string;
  private readonly departedIds = new Set<string>();
  /** Quem assiste → jogador que está acompanhando. */
  private readonly watchedBySpectator = new Map<string, string>();
  /** Jogador eliminado → jogador que está acompanhando. */
  private readonly watchedByEliminated = new Map<string, string>();
  /** Lutas que jogadores vivos foram ver nesta rodada: a rodada também espera por elas. */
  private readonly peekedPlayerIds = new Set<string>();
  private currentDuels: readonly Duel[] = [];
  private preparationEndsAtMs = 0;
  private combatStartedAtMs = 0;
  private cancelPendingTimer: (() => void) | null = null;
  private hasEnded = false;

  constructor(options: MatchControllerOptions) {
    this.game = options.game;
    this.humanIds = options.humanIds;
    this.scheduler = options.scheduler;
    this.sendToPlayer = options.send;
    this.sendToSpectator = options.sendToSpectator ?? (() => undefined);
    this.onEnded = options.onEnded;
    this.contentVersion = options.contentVersion ?? 0;
    this.modifiers = options.modifiers ?? NO_ROOM_MODIFIERS;
    this.mapId = options.mapId ?? DEFAULT_MAPS[0]!.id;
  }

  get isRunning(): boolean {
    return !this.hasEnded;
  }

  get round(): number {
    return this.game.round;
  }

  start(): void {
    this.broadcast({ type: 'match_started', ...this.setupView() });
    this.beginPreparation();
  }

  setupView(): MatchSetupView {
    return {
      players: buildPublicPlayers(this.game),
      synergyMapping: this.game.synergyMapping,
      rotationIndex: this.game.rotationIndex,
      modifiers: this.modifiers,
      mapId: this.mapId,
      contentVersion: this.contentVersion,
    };
  }

  // --- Quem assiste -------------------------------------------------------------------------------

  /** Quem começa a assistir acompanha a primeira pessoa ainda viva (ou o primeiro bot vivo), de preferência quem luta na rodada. */
  get defaultWatchedPlayerId(): string {
    const everyoneAlive = this.game.alivePlayers;
    const fighting = everyoneAlive.filter((player) => this.game.opponentOf(player.id) !== null);
    const alive = fighting.length > 0 ? fighting : everyoneAlive;
    const watched = alive.find((player) => !player.isBot) ?? alive[0] ?? this.game.players[0];
    return watched!.id;
  }

  addSpectator(spectatorId: string, watchedPlayerId: string): void {
    this.watchedBySpectator.set(spectatorId, watchedPlayerId);
    this.sendSnapshot((message) => this.sendToSpectator(spectatorId, message), watchedPlayerId);
  }

  removeSpectator(spectatorId: string): void {
    this.watchedBySpectator.delete(spectatorId);
  }

  /** Troca o jogador acompanhado. Devolve falso se o jogador não existir. */
  watch(spectatorId: string, playerId: string): boolean {
    if (!this.game.players.some((player) => player.id === playerId)) {
      return false;
    }
    this.watchedBySpectator.set(spectatorId, playerId);
    this.sendToSpectator(spectatorId, { type: 'watching', playerId });
    this.sendSwitchSnapshot((message) => this.sendToSpectator(spectatorId, message), playerId);
    return true;
  }

  /**
   * Um jogador da partida pede para ver outro. Vivo: só a luta que está acontecendo. Eliminado: passa a acompanhar.
   * Devolve falso se o jogador pedido não existir.
   */
  watchAsPlayer(viewerId: string, playerId: string): boolean {
    if (!this.game.players.some((player) => player.id === playerId)) {
      return false;
    }
    if (this.hasEnded || !this.isPlaying(viewerId)) {
      return true;
    }
    if (isAlive(this.game.getPlayer(viewerId))) {
      this.peekCombat(viewerId, playerId);
    } else {
      this.followAsEliminated(viewerId, playerId);
    }
    return true;
  }

  private peekCombat(viewerId: string, playerId: string): void {
    const duel = this.duelOf(playerId);
    const isStillFighting = this.game.phase === 'combat' && duel !== undefined && this.combatElapsedMs() < duel.result.durationMs;
    if (!duel || !isStillFighting) {
      this.sendTo(viewerId, { type: 'action_result', ok: false, reason: 'player_not_in_combat' });
      return;
    }
    this.peekedPlayerIds.add(playerId);
    this.sendTo(viewerId, { type: 'combat_peek', playerId, duel: toDuelView(duel) });
    this.scheduleRoundEnd();
  }

  private followAsEliminated(viewerId: string, playerId: string): void {
    this.watchedByEliminated.set(viewerId, playerId);
    this.sendTo(viewerId, { type: 'watching', playerId });
    const send = (message: ServerMessage) => this.sendTo(viewerId, message);
    this.sendSwitchSnapshot(send, playerId);
    if (this.game.phase === 'preparation') {
      send(this.scoutBoardMessage(playerId));
    }
    if (this.game.phase === 'combat') {
      this.scheduleRoundEnd();
    }
  }

  private scoutBoardMessage(playerId: string): ServerMessage {
    const boardUnits = buildOwnView(this.game, playerId).units.filter((unit) => unit.location.kind === 'board');
    return { type: 'scout_board', playerId, units: boardUnits };
  }

  /** O tabuleiro de alguém mudou: quem foi eliminado e o está acompanhando vê na hora. */
  private updateScouts(changedPlayerId: string): void {
    this.watchedByEliminated.forEach((watchedId, viewerId) => {
      if (watchedId === changedPlayerId && this.isPlaying(viewerId)) {
        this.sendTo(viewerId, this.scoutBoardMessage(changedPlayerId));
      }
    });
  }

  handleAction(playerId: string, message: GameActionMessage): void {
    if (this.hasEnded || !this.isPlaying(playerId)) {
      return;
    }
    if (message.type === 'set_ready') {
      this.game.setReady(playerId, message.ready);
      this.sendTo(playerId, { type: 'player_view', view: buildOwnView(this.game, playerId) });
      this.startCombatIfEveryoneIsReady();
      return;
    }
    const result = this.applyAction(playerId, message);
    if (result.ok) {
      this.updateScouts(playerId);
    }
    this.sendTo(playerId, result.ok ? { type: 'action_result', ok: true, fusionCount: result.fusions.length } : { type: 'action_result', ok: false, reason: result.reason });
    this.sendTo(playerId, { type: 'player_view', view: buildOwnView(this.game, playerId) });
  }

  /** O jogador saiu: a vaga vira um bot (com as mesmas vidas, moedas e unidades) até o fim da partida. */
  handleDisconnect(playerId: string): void {
    if (this.hasEnded || !this.isPlaying(playerId)) {
      return;
    }
    this.departedIds.add(playerId);
    this.watchedByEliminated.delete(playerId);
    this.game.convertToBot(playerId);
    const everyHumanIsGone = this.humanIds.every((humanId) => this.departedIds.has(humanId));
    if (everyHumanIsGone) {
      this.finish();
      return;
    }
    this.broadcast({ type: 'players_updated', players: buildPublicPlayers(this.game) });
    if (this.game.phase === 'preparation' && isAlive(this.game.getPlayer(playerId))) {
      playBotPreparation(this.game, playerId);
      this.updateScouts(playerId);
      this.startCombatIfEveryoneIsReady();
    }
  }

  /** Cancela os cronômetros (a sala foi fechada). */
  dispose(): void {
    this.hasEnded = true;
    this.cancelTimer();
  }

  // --- Fases --------------------------------------------------------------------------------------

  private beginPreparation(): void {
    for (const player of this.game.alivePlayers) {
      if (player.isBot) {
        playBotPreparation(this.game, player.id);
      }
    }
    this.currentDuels = [];
    const preparationMs = this.game.preparationSeconds * 1000;
    this.preparationEndsAtMs = this.scheduler.nowMs() + preparationMs;
    for (const humanId of this.humanIds) {
      if (!isAlive(this.game.getPlayer(humanId)) && this.isPlaying(humanId)) {
        this.beginPreparationAsEliminated(humanId);
        continue;
      }
      this.sendTo(humanId, this.roundStartedMessage(this.preparationEndsAtMs, this.game.opponentOf(humanId)));
      this.sendTo(humanId, { type: 'player_view', view: buildOwnView(this.game, humanId) });
    }
    this.watchedBySpectator.forEach((_watched, spectatorId) => this.sendToSpectator(spectatorId, this.roundStartedMessage(this.preparationEndsAtMs, null)));
    this.cancelTimer();
    this.cancelPendingTimer = this.scheduler.after(preparationMs, () => this.startCombat());
    this.startCombatIfEveryoneIsReady();
  }

  /** Quem caiu acompanha alguém vivo (trocando sozinho se o acompanhado também caiu). */
  private beginPreparationAsEliminated(viewerId: string): void {
    const current = this.watchedByEliminated.get(viewerId);
    const isStillFollowing = current !== undefined && isAlive(this.game.getPlayer(current));
    const watchedId = isStillFollowing ? current : this.defaultWatchedPlayerId;
    if (!isStillFollowing) {
      this.watchedByEliminated.set(viewerId, watchedId);
      this.sendTo(viewerId, { type: 'watching', playerId: watchedId });
    }
    this.sendTo(viewerId, this.roundStartedMessage(this.preparationEndsAtMs, null));
    this.sendTo(viewerId, this.scoutBoardMessage(watchedId));
  }

  private roundStartedMessage(preparationEndsAtMs: number, opponentId: string | null): ServerMessage {
    return {
      type: 'round_started',
      round: this.game.round,
      preparationSeconds: this.game.preparationSeconds,
      preparationEndsAtMs,
      serverTimeMs: this.scheduler.nowMs(),
      unitLimit: this.game.unitLimit,
      opponentId,
    };
  }

  private startCombatIfEveryoneIsReady(): void {
    if (this.game.phase === 'preparation' && this.game.everyoneIsReady) {
      this.cancelTimer();
      this.cancelPendingTimer = this.scheduler.after(0, () => this.startCombat());
    }
  }

  private startCombat(): void {
    if (this.hasEnded || this.game.phase !== 'preparation') {
      return;
    }
    const duels = this.game.resolveCombats();
    this.currentDuels = duels;
    this.combatStartedAtMs = this.scheduler.nowMs();
    this.peekedPlayerIds.clear();
    for (const humanId of this.humanIds) {
      this.sendTo(humanId, this.combatStartedMessage(this.watchedByEliminated.get(humanId) ?? humanId));
    }
    this.watchedBySpectator.forEach((watchedId, spectatorId) => this.sendToSpectator(spectatorId, this.combatStartedMessage(watchedId)));
    this.scheduleRoundEnd();
  }

  /** (Re)marca o fim da rodada: alguém pode ter ido ver uma luta mais longa que as que já estavam sendo vistas. */
  private scheduleRoundEnd(): void {
    this.cancelTimer();
    const remainingMs = Math.max(0, this.longestVisibleCombatMs() - this.combatElapsedMs());
    this.cancelPendingTimer = this.scheduler.after(remainingMs, () => this.concludeRound());
  }

  private combatElapsedMs(): number {
    return this.scheduler.nowMs() - this.combatStartedAtMs;
  }

  private duelOf(playerId: string): Duel | undefined {
    return this.currentDuels.find((candidate) => candidate.topId === playerId || candidate.bottomId === playerId);
  }

  /** A rodada só espera os duelos que alguém está vendo: um combate só entre bots não atrasa a próxima loja. */
  private longestVisibleCombatMs(): number {
    const presentHumanIds = this.humanIds.filter((humanId) => this.isPlaying(humanId));
    const seenPlayerIds = new Set([...presentHumanIds, ...this.watchedBySpectator.values(), ...this.watchedByEliminated.values(), ...this.peekedPlayerIds]);
    const visibleDuels = this.currentDuels.filter((duel) => seenPlayerIds.has(duel.topId) || seenPlayerIds.has(duel.bottomId));
    return Math.max(MINIMUM_COMBAT_PHASE_MS, ...visibleDuels.map((duel) => duel.result.durationMs));
  }

  private concludeRound(): void {
    if (this.hasEnded) {
      return;
    }
    const summary = this.game.concludeRound();
    this.broadcast({
      type: 'round_result',
      round: summary.round,
      duels: summary.duels.map(toOutcomeView),
      restingId: summary.restingId,
      eliminatedIds: summary.eliminatedIds,
      towersLostByPlayerId: summary.towersLostByPlayerId,
      towerCompensationByPlayerId: summary.towerCompensationByPlayerId,
      players: buildPublicPlayers(this.game),
    });
    if (this.game.isFinished) {
      this.broadcast({ type: 'match_ended', winnerId: this.game.winnerId, standings: this.game.standings() });
      this.finish();
      return;
    }
    this.cancelTimer();
    this.cancelPendingTimer = this.scheduler.after(this.game.config.rounds.resultSeconds * 1000, () => {
      this.game.startNextRound();
      this.beginPreparation();
    });
  }

  // --- Apoio --------------------------------------------------------------------------------------

  private applyAction(playerId: string, message: Exclude<GameActionMessage, { type: 'set_ready' }>) {
    switch (message.type) {
      case 'buy':
        return this.game.buy(playerId, message.shopSlot);
      case 'refresh_shop':
        return this.game.refresh(playerId);
      case 'toggle_freeze':
        return this.game.toggleFreeze(playerId, message.shopSlot);
      case 'sell':
        return this.game.sell(playerId, message.unitId);
      case 'move':
        return this.game.move(playerId, message.unitId, message.destination);
    }
  }

  /** O duelo do jogador (ou `null` se ele descansa ou já caiu). */
  private combatStartedMessage(playerId: string, elapsedMs?: number): ServerMessage {
    const duel = this.duelOf(playerId);
    return { type: 'combat_started', round: this.game.round, duel: duel ? toDuelView(duel) : null, ...(elapsedMs === undefined ? {} : { elapsedMs }) };
  }

  /**
   * Ao trocar de jogador na tela de resultado não há o que mostrar: um novo início de rodada trocaria o resultado por
   * uma preparação vazia. A próxima rodada já vem na visão do escolhido.
   */
  private sendSwitchSnapshot(send: (message: ServerMessage) => void, playerId: string): void {
    if (this.game.phase === 'preparation' || this.game.phase === 'combat') {
      this.sendSnapshot(send, playerId);
    }
  }

  /** O que quem assiste precisa para entrar no meio: a rodada atual e, se houver combate, o duelo já em andamento. */
  private sendSnapshot(send: (message: ServerMessage) => void, watchedPlayerId: string): void {
    const isPreparing = this.game.phase === 'preparation';
    const preparationEndsAtMs = isPreparing ? this.preparationEndsAtMs : this.scheduler.nowMs();
    send(this.roundStartedMessage(preparationEndsAtMs, null));
    if (this.game.phase === 'combat') {
      send(this.combatStartedMessage(watchedPlayerId, this.combatElapsedMs()));
    }
  }

  private isPlaying(playerId: string): boolean {
    return this.humanIds.includes(playerId) && !this.departedIds.has(playerId);
  }

  private finish(): void {
    if (this.hasEnded) {
      return;
    }
    this.dispose();
    this.onEnded();
  }

  private cancelTimer(): void {
    this.cancelPendingTimer?.();
    this.cancelPendingTimer = null;
  }

  /** Só para o que é público: vai a quem joga e a quem assiste. */
  private broadcast(message: ServerMessage): void {
    this.humanIds.forEach((humanId) => this.sendTo(humanId, message));
    this.watchedBySpectator.forEach((_watched, spectatorId) => this.sendToSpectator(spectatorId, message));
  }

  private sendTo(playerId: string, message: ServerMessage): void {
    this.sendToPlayer(playerId, message);
  }
}
