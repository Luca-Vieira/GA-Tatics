import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { DEFAULT_SYNERGIES, DEFAULT_SYNERGY_ROTATION, INITIAL_SYNERGY_MAPPING } from '@data/defaults/synergies';
import { playBotPreparation } from '../players/botStrategy';
import type { ActionResult } from '../players/playerActions';
import { isAlive, type UnitLocation } from '../players/playerState';
import { rotationIndexAt, synergyMappingForIndex } from '../synergies/rotation';
import { playMatchWithBots } from './botMatch';
import { Game, MAXIMUM_PLAYERS, MINIMUM_PLAYERS, type GamePlayerInput } from './Game';
import type { HumanDuel, MatchSession, SessionListener, SpriteSource } from './MatchSession';

export const LOCAL_HUMAN_ID = 'human';
export const DEFAULT_LOCAL_PLAYER_COUNT = 4;
const BOT_NAMES = ['Bot Ana', 'Bot Beto', 'Bot Caio', 'Bot Duda', 'Bot Edu', 'Bot Fabi', 'Bot Gil'];
/** Depois de apertar "pronto", espera um instante antes de começar, para dar tempo de desfazer. */
const READY_DELAY_MS = 350;

type LocalPhase = 'preparation' | 'combat' | 'result' | 'over';

export interface LocalMatchOptions {
  readonly seed?: string;
  /** Hora usada para escolher a rotação de sinergias (injetável nos testes). */
  readonly nowMs?: number;
  /** Total de jogadores, contando o humano (de 2 a 8). */
  readonly playerCount?: number;
}

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

function localPlayers(playerCount: number): GamePlayerInput[] {
  if (!Number.isInteger(playerCount) || playerCount < MINIMUM_PLAYERS || playerCount > MAXIMUM_PLAYERS) {
    throw new Error(`A partida precisa de ${MINIMUM_PLAYERS} a ${MAXIMUM_PLAYERS} jogadores.`);
  }
  const bots = BOT_NAMES.slice(0, playerCount - 1).map((name, index) => ({ id: `bot${index + 1}`, name, isBot: true }));
  return [{ id: LOCAL_HUMAN_ID, name: 'Você', isBot: false }, ...bots];
}

/** Partida do jogador contra bots, rodando inteira no navegador: o cronômetro e os bots ficam aqui, as regras no `Game`. */
export class LocalMatchSession implements MatchSession {
  readonly humanId = LOCAL_HUMAN_ID;
  readonly spectator = null;
  readonly match: Game;
  readonly spriteSources: readonly SpriteSource[] = [];
  readonly roomRules: readonly string[] = [];

  private listener: SessionListener = NO_LISTENER;
  private phase: LocalPhase = 'preparation';
  private remainingMs = 0;
  /** Tempo desde que o jogador ficou pronto; `null` enquanto não está pronto. */
  private readyElapsedMs: number | null = null;

  constructor(options: LocalMatchOptions = {}) {
    const rotationIndex = rotationIndexAt(options.nowMs ?? Date.now(), DEFAULT_SYNERGY_ROTATION);
    this.match = new Game({
      seed: options.seed ?? `partida-${Math.floor(Math.random() * 0xffffffff)}`,
      roster: DEFAULT_CHARACTERS,
      players: localPlayers(options.playerCount ?? DEFAULT_LOCAL_PLAYER_COUNT),
      synergyMapping: synergyMappingForIndex(
        rotationIndex,
        DEFAULT_SYNERGY_ROTATION,
        INITIAL_SYNERGY_MAPPING,
        DEFAULT_SYNERGIES.map((synergy) => synergy.id),
      ),
      rotationIndex,
      bottomPlayerId: LOCAL_HUMAN_ID,
    });
  }

  get preparationRemainingMs(): number {
    return this.phase === 'preparation' ? Math.max(0, this.remainingMs) : 0;
  }

  setListener(listener: SessionListener): void {
    this.listener = listener;
  }

  start(): void {
    this.beginPreparation();
  }

  update(deltaMs: number): void {
    if (this.phase !== 'preparation') {
      return;
    }
    this.remainingMs -= deltaMs;
    if (this.readyElapsedMs !== null) {
      this.readyElapsedMs += deltaMs;
    }
    const isReadyDelayOver = this.readyElapsedMs !== null && this.readyElapsedMs >= READY_DELAY_MS;
    if (this.remainingMs <= 0 || (this.match.everyoneIsReady && isReadyDelayOver)) {
      this.startCombat();
    }
  }

  // --- Ações do jogador ---------------------------------------------------------------------------

  buy(shopSlot: number): void {
    this.afterAction(this.isPreparing ? this.match.buy(LOCAL_HUMAN_ID, shopSlot) : null);
  }

  refreshShop(): void {
    this.afterAction(this.isPreparing ? this.match.refresh(LOCAL_HUMAN_ID) : null);
  }

  toggleFreeze(shopSlot: number): void {
    this.afterAction(this.isPreparing ? this.match.toggleFreeze(LOCAL_HUMAN_ID, shopSlot) : null);
  }

  sell(unitId: string): void {
    this.afterAction(this.isPreparing ? this.match.sell(LOCAL_HUMAN_ID, unitId) : null);
  }

  move(unitId: string, destination: UnitLocation): void {
    this.afterAction(this.isPreparing ? this.match.move(LOCAL_HUMAN_ID, unitId, destination) : null);
  }

  setReady(isReady: boolean): void {
    if (!this.isPreparing) {
      return;
    }
    this.match.setReady(LOCAL_HUMAN_ID, isReady);
    this.readyElapsedMs = isReady ? 0 : null;
    this.listener.stateChanged();
  }

  // --- Andamento ----------------------------------------------------------------------------------

  presentationFinished(): void {
    if (this.phase !== 'combat') {
      return;
    }
    // O resultado oficial vem do jogo (a apresentação só reproduz).
    const summary = this.match.concludeRound();
    this.phase = 'result';
    this.listener.roundConcluded(summary);
  }

  continueAfterResult(): void {
    if (this.phase !== 'result') {
      return;
    }
    const humanWasEliminated = !isAlive(this.match.getPlayer(LOCAL_HUMAN_ID));
    if (humanWasEliminated && !this.match.isFinished) {
      // O jogador caiu: a partida termina entre os bots para definir a colocação final.
      playMatchWithBots(this.match);
    }
    if (this.match.isFinished) {
      this.phase = 'over';
      this.listener.matchEnded();
      return;
    }
    this.match.startNextRound();
    this.beginPreparation();
  }

  /** Abandonar a partida contra bots apenas a encerra. */
  leave(): void {
    this.phase = 'over';
    this.dispose();
  }

  dispose(): void {
    this.listener = NO_LISTENER;
  }

  // --- Apoio --------------------------------------------------------------------------------------

  private get isPreparing(): boolean {
    return this.phase === 'preparation';
  }

  private beginPreparation(): void {
    this.phase = 'preparation';
    this.readyElapsedMs = null;
    this.remainingMs = this.match.preparationSeconds * 1000;
    this.match.players.filter((player) => player.isBot && isAlive(player)).forEach((bot) => playBotPreparation(this.match, bot.id));
    this.listener.preparationStarted();
  }

  private startCombat(): void {
    this.phase = 'combat';
    const duels = this.match.resolveCombats();
    const duel = duels.find((candidate) => candidate.topId === LOCAL_HUMAN_ID || candidate.bottomId === LOCAL_HUMAN_ID);
    const humanDuel: HumanDuel | null = duel ? { topId: duel.topId, bottomId: duel.bottomId, combatConfig: duel.combatConfig } : null;
    this.listener.combatStarted(humanDuel);
  }

  private afterAction(result: ActionResult | null): void {
    if (result === null) {
      return;
    }
    if (result.ok) {
      result.fusions.forEach((fusion) => this.listener.fusionHappened(`Fusão! ${this.match.getCharacter(fusion.characterId).name} ${'★'.repeat(fusion.resultStarLevel)}`));
    } else {
      this.listener.actionFailed(result.reason);
    }
    this.listener.stateChanged();
  }
}
