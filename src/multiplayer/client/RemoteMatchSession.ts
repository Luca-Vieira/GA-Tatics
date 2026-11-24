import type { HumanDuel, MatchSession, RoundResultDuel, RoundResultSummary, SessionListener, SpriteSource } from '@core/game/MatchSession';
import type { UnitLocation } from '@core/players/playerState';
import type { CombatResult } from '@combat/engine/result';
import type { GameContent } from '@data/schemas/content';
import type { ServerMessage } from '../protocol/serverMessages';
import type { ServerConnection } from './ServerConnection';
import { RemoteMatchState } from './RemoteMatchState';

type Message<Type extends ServerMessage['type']> = Extract<ServerMessage, { type: Type }>;

const NO_LISTENER: SessionListener = {
  preparationStarted: () => undefined,
  combatStarted: () => undefined,
  roundConcluded: () => undefined,
  matchEnded: () => undefined,
  stateChanged: () => undefined,
  actionFailed: () => undefined,
  fusionHappened: () => undefined,
  connectionLost: () => undefined,
};

/**
 * Partida em rede, do ponto de vista de um jogador. O servidor é a única fonte da verdade: esta classe só envia as
 * intenções do jogador (comprar, mover, vender, ficar pronto) e aplica ao espelho local o que o servidor responde.
 *
 * Mensagens que chegam antes de a cena existir (o servidor começa a rodada logo após `match_started`) ficam
 * guardadas no estado e são reapresentadas quando a cena chama `start()`.
 */
export class RemoteMatchSession implements MatchSession {
  readonly match: RemoteMatchState;
  readonly spriteSources: readonly SpriteSource[];

  private listener: SessionListener = NO_LISTENER;
  private isStarted = false;
  private hasRound = false;
  private preparationEndsAtMs = 0;
  /** Quanto o relógio do servidor está adiantado em relação ao nosso (servidor − cliente). */
  private clockOffsetMs = 0;
  private humanDuelResult: { readonly topId: string; readonly bottomId: string; readonly result: CombatResult } | null = null;
  private readonly stopListening: () => void;
  private readonly stopListeningForClose: () => void;

  constructor(
    private readonly connection: ServerConnection,
    readonly humanId: string,
    started: Message<'match_started'>,
    content: GameContent,
    spriteBaseUrl: string,
    private readonly nowMs: () => number = Date.now,
  ) {
    this.match = new RemoteMatchState(humanId, started, content);
    this.spriteSources = content.characters.flatMap((character) =>
      character.sprite
        ? [
            {
              characterId: character.id,
              url: `${spriteBaseUrl}${character.sprite.path}`,
              scale: character.sprite.scale,
              offsetX: character.sprite.offsetX,
              offsetY: character.sprite.offsetY,
              anchorX: character.sprite.anchorX,
              anchorY: character.sprite.anchorY,
            },
          ]
        : [],
    );
    this.stopListening = connection.onMessage((message) => this.handle(message));
    this.stopListeningForClose = connection.onClose(() => this.listener.connectionLost());
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
  }

  /** O relógio da preparação vem do servidor; não há nada a contar aqui. */
  update(): void {}

  // --- Intenções do jogador -----------------------------------------------------------------------

  buy(shopSlot: number): void {
    this.connection.send({ type: 'buy', shopSlot });
  }

  refreshShop(): void {
    this.connection.send({ type: 'refresh_shop' });
  }

  toggleFreeze(shopSlot: number): void {
    this.connection.send({ type: 'toggle_freeze', shopSlot });
  }

  sell(unitId: string): void {
    this.connection.send({ type: 'sell', unitId });
  }

  move(unitId: string, destination: UnitLocation): void {
    this.connection.send({ type: 'move', unitId, destination });
  }

  setReady(isReady: boolean): void {
    this.connection.send({ type: 'set_ready', ready: isReady });
  }

  /** O servidor espera o combate mais longo da rodada e então envia o resultado; a cena só precisa esperá-lo. */
  presentationFinished(): void {}

  /** A próxima rodada começa quando o servidor avisar. */
  continueAfterResult(): void {}

  dispose(): void {
    this.stopListening();
    this.stopListeningForClose();
    this.listener = NO_LISTENER;
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
        this.match.applyMatchEnded(message);
        this.listener.matchEnded();
        return;
      default:
        return;
    }
  }

  private beginRound(message: Message<'round_started'>): void {
    this.match.applyRoundStarted(message);
    this.clockOffsetMs = message.serverTimeMs - this.nowMs();
    this.preparationEndsAtMs = message.preparationEndsAtMs;
    this.hasRound = true;
    this.humanDuelResult = null;
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
    const humanDuel: HumanDuel | null = duel ? { topId: duel.topId, bottomId: duel.bottomId, combatConfig: duel.combatConfig } : null;
    this.listener.combatStarted(humanDuel);
  }

  private concludeRound(message: Message<'round_result'>): void {
    this.match.applyPublicPlayers(message.players);
    const duels = message.duels.map((outcome): RoundResultDuel => {
      const ownDuel = this.humanDuelResult;
      const isOwnDuel = ownDuel !== null && ownDuel.topId === outcome.topId && ownDuel.bottomId === outcome.bottomId;
      return { ...outcome, result: isOwnDuel ? { healthPercentBySide: ownDuel.result.healthPercentBySide } : null };
    });
    const summary: RoundResultSummary = { duels, restingId: message.restingId, eliminatedIds: message.eliminatedIds, towersLostByPlayerId: message.towersLostByPlayerId };
    this.listener.roundConcluded(summary);
  }
}
