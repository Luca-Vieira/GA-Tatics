import type { HumanDuel, MatchScenery, MatchSession, RoundResultDuel, RoundResultSummary, SessionListener, SpectatorControls, SpriteSource } from '@core/game/MatchSession';
import type { UnitLocation } from '@core/players/playerState';
import { pickMap } from '@core/maps/pickMap';
import type { CombatResult } from '@combat/engine/result';
import type { GameContent } from '@data/schemas/content';
import type { ClientMessage } from '../protocol/clientMessages';
import type { DuelView, MatchSetupView, ServerMessage } from '../protocol/serverMessages';
import type { ServerConnection } from './ServerConnection';
import { RemoteMatchState } from './RemoteMatchState';
import { spriteSourcesOf } from './spriteSources';

type Message<Type extends ServerMessage['type']> = Extract<ServerMessage, { type: Type }>;

export interface RemoteSessionOptions {
  /** Quem só assiste: `humanId` é o jogador acompanhado e nenhuma ação é enviada. */
  readonly isSpectator?: boolean;
  /** Como sair da sala (o saguão também precisa esquecer a sala); sem isto, só avisa o servidor. */
  readonly leaveRoom?: () => void;
  readonly nowMs?: () => number;
}

/** Combate que chegou antes de a cena existir. */
interface PendingCombat {
  readonly duel: HumanDuel | null;
  readonly elapsedMs: number;
  readonly receivedAtMs: number;
}

const NO_LISTENER: SessionListener = {
  preparationStarted: () => undefined,
  combatStarted: () => undefined,
  combatPeekStarted: () => undefined,
  roundConcluded: () => undefined,
  matchEnded: () => undefined,
  stateChanged: () => undefined,
  actionFailed: () => undefined,
  fusionHappened: () => undefined,
  connectionLost: () => undefined,
};

function toHumanDuel(duel: DuelView): HumanDuel {
  return { topId: duel.topId, bottomId: duel.bottomId, combatConfig: duel.combatConfig, durationMs: duel.result.durationMs };
}

/** O mapa que o servidor escolheu, com o endereço completo da imagem de fundo, se houver. */
function sceneryOf(content: GameContent, mapId: string, spriteBaseUrl: string): MatchScenery {
  const map = pickMap(content.maps, mapId, mapId);
  return { map, backgroundImageUrl: map.background.type === 'image' ? `${spriteBaseUrl}${map.background.path}` : null };
}

/**
 * Partida em rede, do ponto de vista de um jogador (ou de quem assiste). O servidor é a única fonte da verdade: esta
 * classe só envia as intenções (comprar, mover, vender, ficar pronto) e aplica ao espelho local o que o servidor responde.
 *
 * Mensagens que chegam antes de a cena existir (o servidor começa a rodada logo após `match_started`) ficam
 * guardadas no estado e são reapresentadas quando a cena chama `start()`.
 */
export class RemoteMatchSession implements MatchSession {
  readonly match: RemoteMatchState;
  readonly spriteSources: readonly SpriteSource[];
  readonly scenery: MatchScenery;
  readonly roomRules: readonly string[];
  private spectatorControls: SpectatorControls | null;

  private listener: SessionListener = NO_LISTENER;
  private isStarted = false;
  private hasRound = false;
  private hasMatchEnded = false;
  private pendingCombat: PendingCombat | null = null;
  private currentHumanId: string;
  private preparationEndsAtMs = 0;
  /** Quanto o relógio do servidor está adiantado em relação ao nosso (servidor − cliente). */
  private clockOffsetMs = 0;
  private humanDuelResult: { readonly topId: string; readonly bottomId: string; readonly result: CombatResult } | null = null;
  private readonly nowMs: () => number;
  private readonly stopListening: () => void;
  private readonly stopListeningForClose: () => void;

  constructor(
    private readonly connection: ServerConnection,
    humanId: string,
    setup: MatchSetupView,
    content: GameContent,
    spriteBaseUrl: string,
    private readonly options: RemoteSessionOptions = {},
  ) {
    this.currentHumanId = humanId;
    this.nowMs = options.nowMs ?? Date.now;
    this.match = new RemoteMatchState(humanId, setup, content);
    this.roomRules = this.match.roomRules;
    this.spriteSources = spriteSourcesOf(content, spriteBaseUrl);
    this.scenery = sceneryOf(content, setup.mapId, spriteBaseUrl);
    this.spectatorControls = options.isSpectator ? this.createSpectatorControls() : null;
    this.stopListening = connection.onMessage((message) => this.handle(message));
    this.stopListeningForClose = connection.onClose(() => this.listener.connectionLost());
  }

  get humanId(): string {
    return this.currentHumanId;
  }

  /** Quem joga passa a ter os controles de espectador quando é eliminado. */
  get spectator(): SpectatorControls | null {
    return this.spectatorControls;
  }

  get preparationRemainingMs(): number {
    return this.hasRound ? Math.max(0, this.preparationEndsAtMs - (this.nowMs() + this.clockOffsetMs)) : 0;
  }

  setListener(listener: SessionListener): void {
    this.listener = listener;
  }

  start(): void {
    this.isStarted = true;
    if (this.hasRound) {
      this.listener.preparationStarted();
    }
    this.replayPendingCombat();
    if (this.hasMatchEnded) {
      this.listener.matchEnded();
    }
  }

  /** O relógio da preparação vem do servidor; não há nada a contar aqui. */
  update(): void {}

  // --- Intenções do jogador -----------------------------------------------------------------------

  buy(shopSlot: number): void {
    this.sendIntent({ type: 'buy', shopSlot });
  }

  refreshShop(): void {
    this.sendIntent({ type: 'refresh_shop' });
  }

  toggleFreeze(shopSlot: number): void {
    this.sendIntent({ type: 'toggle_freeze', shopSlot });
  }

  sell(unitId: string): void {
    this.sendIntent({ type: 'sell', unitId });
  }

  move(unitId: string, destination: UnitLocation): void {
    this.sendIntent({ type: 'move', unitId, destination });
  }

  setReady(isReady: boolean): void {
    this.sendIntent({ type: 'set_ready', ready: isReady });
  }

  watchCombat(playerId: string): void {
    this.connection.send({ type: 'watch_player', playerId });
  }

  /** O servidor espera o combate mais longo da rodada e então envia o resultado; a cena só precisa esperá-lo. */
  presentationFinished(): void {}

  /** A próxima rodada começa quando o servidor avisar. */
  continueAfterResult(): void {}

  /** Sai da sala: para quem joga, um bot assume a vaga; para quem assiste, só deixa de assistir. */
  leave(): void {
    this.dispose();
    if (this.options.leaveRoom) {
      this.options.leaveRoom();
      return;
    }
    this.connection.send({ type: 'leave_room' });
  }

  dispose(): void {
    this.stopListening();
    this.stopListeningForClose();
    this.listener = NO_LISTENER;
  }

  // --- Apoio --------------------------------------------------------------------------------------

  private sendIntent(message: ClientMessage): void {
    if (this.spectator) {
      this.listener.actionFailed('spectator');
      return;
    }
    this.connection.send(message);
  }

  private createSpectatorControls(): SpectatorControls {
    const watchedId = () => this.humanId;
    return {
      get watchedPlayerId() {
        return watchedId();
      },
      watch: (playerId: string) => {
        if (playerId !== watchedId()) {
          this.connection.send({ type: 'watch_player', playerId });
        }
      },
    };
  }

  private replayPendingCombat(): void {
    const pending = this.pendingCombat;
    this.pendingCombat = null;
    if (pending) {
      const elapsedMs = pending.elapsedMs + (this.nowMs() - pending.receivedAtMs);
      this.listener.combatStarted(pending.duel ? { ...pending.duel, elapsedMs } : null);
    }
  }

  // --- Mensagens do servidor ----------------------------------------------------------------------

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'round_started':
        this.beginRound(message);
        return;
      case 'player_view':
        this.match.applyOwnView(message.view);
        this.listener.stateChanged();
        return;
      case 'players_updated':
        this.match.applyPublicPlayers(message.players);
        this.listener.stateChanged();
        return;
      case 'watching':
        // Um jogador só recebe isto depois de eliminado: dali em diante ele assiste.
        this.spectatorControls ??= this.createSpectatorControls();
        // O retrato da partida na visão desse jogador vem logo em seguida (rodada e, se houver, o combate).
        this.currentHumanId = message.playerId;
        this.match.watch(message.playerId);
        this.humanDuelResult = null;
        return;
      case 'scout_board':
        this.match.showScoutedBoard(message.units);
        this.listener.stateChanged();
        return;
      case 'combat_peek':
        this.listener.combatPeekStarted(message.playerId, toHumanDuel(message.duel));
        return;
      case 'action_result':
        this.reportAction(message);
        return;
      case 'combat_started':
        this.startCombat(message);
        return;
      case 'round_result':
        this.concludeRound(message);
        return;
      case 'match_ended':
        this.hasMatchEnded = true;
        this.match.applyMatchEnded(message);
        this.listener.matchEnded();
        return;
      default:
        return;
    }
  }

  private beginRound(message: Message<'round_started'>): void {
    if (this.spectator) {
      this.match.clearBoards();
    }
    this.match.applyRoundStarted(message);
    this.clockOffsetMs = message.serverTimeMs - this.nowMs();
    this.preparationEndsAtMs = message.preparationEndsAtMs;
    this.hasRound = true;
    this.humanDuelResult = null;
    this.pendingCombat = null;
    if (this.isStarted) {
      this.listener.preparationStarted();
    }
  }

  private reportAction(message: Message<'action_result'>): void {
    if (message.ok) {
      for (let fusion = 0; fusion < message.fusionCount; fusion++) {
        this.listener.fusionHappened('Fusão!');
      }
    } else {
      this.listener.actionFailed(message.reason);
    }
  }

  private startCombat(message: Message<'combat_started'>): void {
    const duel = message.duel;
    this.humanDuelResult = duel ? { topId: duel.topId, bottomId: duel.bottomId, result: duel.result } : null;
    if (this.spectator && duel) {
      this.match.showWatchedBoard(duel);
    }
    const humanDuel: HumanDuel | null = duel ? toHumanDuel(duel) : null;
    if (!this.isStarted) {
      this.pendingCombat = { duel: humanDuel, elapsedMs: message.elapsedMs ?? 0, receivedAtMs: this.nowMs() };
      return;
    }
    this.listener.combatStarted(humanDuel && message.elapsedMs !== undefined ? { ...humanDuel, elapsedMs: message.elapsedMs } : humanDuel);
  }

  private concludeRound(message: Message<'round_result'>): void {
    this.pendingCombat = null;
    this.match.applyPublicPlayers(message.players);
    const duels = message.duels.map((outcome): RoundResultDuel => {
      const ownDuel = this.humanDuelResult;
      const isOwnDuel = ownDuel !== null && ownDuel.topId === outcome.topId && ownDuel.bottomId === outcome.bottomId;
      return { ...outcome, result: isOwnDuel ? { healthPercentBySide: ownDuel.result.healthPercentBySide } : null };
    });
    const summary: RoundResultSummary = { duels, restingId: message.restingId, eliminatedIds: message.eliminatedIds, towersLostByPlayerId: message.towersLostByPlayerId, towerCompensationByPlayerId: message.towerCompensationByPlayerId };
    this.listener.roundConcluded(summary);
  }
}
