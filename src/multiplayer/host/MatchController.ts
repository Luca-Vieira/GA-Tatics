import type { Game } from '@core/game/Game';
import { NO_ROOM_MODIFIERS, type RoomModifiers } from '@data/schemas/roomModifiers';
import { playBotPreparation } from '@core/players/botStrategy';
import { isAlive } from '@core/players/playerState';
import type { GameActionMessage } from '../protocol/clientMessages';
import type { ServerMessage } from '../protocol/serverMessages';
import { buildOwnView, buildPublicPlayers, toDuelView, toOutcomeView } from './playerViews';
import type { Scheduler } from './scheduler';

export interface MatchControllerOptions {
  readonly game: Game;
  /** Jogadores controlados por pessoas; os demais jogadores da partida são bots. */
  readonly humanIds: readonly string[];
  readonly scheduler: Scheduler;
  readonly send: (playerId: string, message: ServerMessage) => void;
  /** Chamado uma vez quando a partida acaba ou é abandonada. */
  readonly onEnded: () => void;
  /** Versão do conteúdo do jogo com que a partida foi criada (vai para os clientes em `match_started`). */
  readonly contentVersion?: number;
  /** Regras especiais da sala (vão para os clientes em `match_started`, para a interface calcular os mesmos valores). */
  readonly modifiers?: RoomModifiers;
}

/**
 * Dono da partida no servidor: roda o `Game` (única fonte da verdade), controla os cronômetros de cada fase e
 * entrega a cada jogador só o que ele pode ver. Quem cai da conexão passa a ser jogado pelo bot.
 */
export class MatchController {
  private readonly game: Game;
  private readonly humanIds: readonly string[];
  private readonly scheduler: Scheduler;
  private readonly sendToPlayer: (playerId: string, message: ServerMessage) => void;
  private readonly onEnded: () => void;
  private readonly contentVersion: number;
  private readonly modifiers: RoomModifiers;
  private readonly autopilotIds = new Set<string>();
  private cancelPendingTimer: (() => void) | null = null;
  private hasEnded = false;

  constructor(options: MatchControllerOptions) {
    this.game = options.game;
    this.humanIds = options.humanIds;
    this.scheduler = options.scheduler;
    this.sendToPlayer = options.send;
    this.onEnded = options.onEnded;
    this.contentVersion = options.contentVersion ?? 0;
    this.modifiers = options.modifiers ?? NO_ROOM_MODIFIERS;
  }

  get isRunning(): boolean {
    return !this.hasEnded;
  }

  start(): void {
    this.broadcast({
      type: 'match_started',
      players: buildPublicPlayers(this.game),
      synergyMapping: this.game.synergyMapping,
      rotationIndex: this.game.rotationIndex,
      modifiers: this.modifiers,
      contentVersion: this.contentVersion,
    });
    this.beginPreparation();
  }

  handleAction(playerId: string, message: GameActionMessage): void {
    if (this.hasEnded || !this.humanIds.includes(playerId)) {
      return;
    }
    if (message.type === 'set_ready') {
      this.game.setReady(playerId, message.ready);
      this.sendTo(playerId, { type: 'player_view', view: buildOwnView(this.game, playerId) });
      this.startCombatIfEveryoneIsReady();
      return;
    }
    const result = this.applyAction(playerId, message);
    this.sendTo(playerId, result.ok ? { type: 'action_result', ok: true, fusionCount: result.fusions.length } : { type: 'action_result', ok: false, reason: result.reason });
    this.sendTo(playerId, { type: 'player_view', view: buildOwnView(this.game, playerId) });
  }

  /** O jogador saiu: o bot assume o lugar dele até o fim da partida. */
  handleDisconnect(playerId: string): void {
    if (this.hasEnded || !this.humanIds.includes(playerId)) {
      return;
    }
    this.autopilotIds.add(playerId);
    const everyHumanIsGone = this.humanIds.every((humanId) => this.autopilotIds.has(humanId));
    if (everyHumanIsGone) {
      this.finish();
      return;
    }
    if (this.game.phase === 'preparation' && isAlive(this.game.getPlayer(playerId))) {
      playBotPreparation(this.game, playerId);
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
      if (player.isBot || this.autopilotIds.has(player.id)) {
        playBotPreparation(this.game, player.id);
      }
    }
    const preparationSeconds = this.game.preparationSeconds;
    const nowMs = this.scheduler.nowMs();
    for (const humanId of this.humanIds) {
      this.sendTo(humanId, {
        type: 'round_started',
        round: this.game.round,
        preparationSeconds,
        preparationEndsAtMs: nowMs + preparationSeconds * 1000,
        serverTimeMs: nowMs,
        unitLimit: this.game.unitLimit,
        opponentId: this.game.opponentOf(humanId),
      });
      this.sendTo(humanId, { type: 'player_view', view: buildOwnView(this.game, humanId) });
    }
    this.cancelTimer();
    this.cancelPendingTimer = this.scheduler.after(preparationSeconds * 1000, () => this.startCombat());
    this.startCombatIfEveryoneIsReady();
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
    for (const humanId of this.humanIds) {
      const duel = duels.find((candidate) => candidate.topId === humanId || candidate.bottomId === humanId);
      this.sendTo(humanId, { type: 'combat_started', round: this.game.round, duel: duel ? toDuelView(duel) : null });
    }
    const longestCombatMs = Math.max(0, ...duels.map((duel) => duel.result.durationMs));
    this.cancelTimer();
    this.cancelPendingTimer = this.scheduler.after(longestCombatMs, () => this.concludeRound());
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

  private broadcast(message: ServerMessage): void {
    this.humanIds.forEach((humanId) => this.sendTo(humanId, message));
  }

  private sendTo(playerId: string, message: ServerMessage): void {
    this.sendToPlayer(playerId, message);
  }
}
