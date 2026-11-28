import { CombatSimulation, type CombatConfig } from '@combat/engine/CombatSimulation';
import type { CombatResult } from '@combat/engine/result';
import type { CharacterDefinition } from '@data/schemas/character';
import { DEFAULT_GAME_CONFIG } from '@data/defaults/gameConfig';
import { DEFAULT_SYNERGIES, DEFAULT_SYNERGY_ROTATION } from '@data/defaults/synergies';
import type { GameConfig } from '@data/schemas/gameConfig';
import type { SynergyDefinition, SynergyRotationConfig } from '@data/schemas/synergy';
import { SeededRandom } from '@shared/utils/random';
import { coinsAtRoundStart } from '../economy/economy';
import { buyFromShop, moveUnit, refillShop, refreshShop, sellUnit, toggleFreezeShopSlot, type ActionContext, type ActionResult } from '../players/playerActions';
import { boardUnitsOf, createPlayerState, isAlive, type PlayerState, type UnitLocation } from '../players/playerState';
import { createPairings, type RoundPairings, type RoundRecord } from '../rounds/pairings';
import { livesLostOnDefeat, preparationSecondsForRound, unitLimitForRound } from '../rounds/rounds';
import { summarizeSynergies, type SynergyMapping, type SynergyStatus } from '../synergies/synergies';
import { buildCombatConfig, combatUnitId, type CombatSetupContext } from './combatSetup';
import type { CombatRules } from './roomModifiers';
import { buildTowerCharacters, isTowerId, towerDefinitionOf, towerDefinitionsOf, towerIncomeOf } from '../tower/tower';

export type GamePhase = 'preparation' | 'combat' | 'result' | 'finished';

export const MINIMUM_PLAYERS = 2;
export const MAXIMUM_PLAYERS = 8;

export interface GamePlayerInput {
  readonly id: string;
  readonly name: string;
  readonly isBot: boolean;
}

export interface GameOptions {
  /** Semente da partida: lojas e combates derivam dela, então a mesma semente e as mesmas ações dão a mesma partida. */
  readonly seed: string;
  readonly roster: readonly CharacterDefinition[];
  readonly players: readonly GamePlayerInput[];
  /** Distribuição de sinergias vigente ao criar a partida; vale até o fim dela (GDD 4.4). */
  readonly synergyMapping: SynergyMapping;
  readonly rotationIndex: number;
  readonly config?: GameConfig;
  readonly synergies?: readonly SynergyDefinition[];
  /** Regras de combate da sala (bônus de status e limite de tempo). Sem elas, valem as normais. */
  readonly combatRules?: CombatRules;
  /** Regra de rotação vigente (só a interface a usa, para mostrar a contagem até a próxima troca). */
  readonly synergyRotation?: SynergyRotationConfig;
  /** Quando este jogador tem um duelo, ele luta na metade de baixo da tela (lado B). */
  readonly bottomPlayerId?: string;
}

/** Combate já simulado: a configuração (para animar) e o resultado oficial. */
export interface Duel {
  readonly topId: string;
  readonly bottomId: string;
  readonly combatConfig: CombatConfig;
  readonly result: CombatResult;
}

export interface DuelOutcome {
  readonly topId: string;
  readonly bottomId: string;
  /** `null` em caso de empate. */
  readonly winnerId: string | null;
  readonly loserId: string | null;
  readonly livesLost: number;
  readonly result: CombatResult;
}

export interface RoundSummary {
  readonly round: number;
  readonly duels: readonly DuelOutcome[];
  readonly restingId: string | null;
  readonly eliminatedIds: readonly string[];
  /** Torres destruídas na rodada, por jogador (elas somem para sempre). */
  readonly towersLostByPlayerId: Readonly<Record<string, number>>;
  /** Quanto cada um desses recebe de volta no início da próxima rodada. */
  readonly towerCompensationByPlayerId: Readonly<Record<string, number>>;
}

export interface Standing {
  readonly playerId: string;
  readonly place: number;
}

interface TowerLosses {
  readonly lostByPlayerId: Record<string, number>;
  readonly compensationByPlayerId: Record<string, number>;
}

/**
 * Regras da partida, sem relógio nem interface: a rodada avança por chamadas explícitas
 * (`resolveCombats`, `concludeRound`, `startNextRound`), e o cronômetro da preparação fica por conta de quem apresenta o jogo.
 */
export class Game {
  readonly config: GameConfig;
  readonly synergies: readonly SynergyDefinition[];
  readonly synergyMapping: SynergyMapping;
  readonly rotationIndex: number;
  readonly synergyRotation: SynergyRotationConfig;

  private readonly seed: string;
  private readonly roster: readonly CharacterDefinition[];
  private readonly charactersById: ReadonlyMap<string, CharacterDefinition>;
  private readonly bottomPlayerId: string | undefined;
  private readonly combatRules: CombatRules | undefined;
  private readonly playerList: PlayerState[];
  /** Ordem sorteada uma vez por partida: decide quem descansa primeiro quando há empate. */
  private readonly restDrawOrder: readonly string[];
  private readonly shopRandomByPlayer = new Map<string, SeededRandom>();
  private readonly towerRandomByPlayer = new Map<string, SeededRandom>();
  private readonly history: RoundRecord[] = [];
  /** Moedas por torres destruídas ainda não pagas; saem daqui no início da rodada seguinte, uma única vez. */
  private readonly towerCompensationByPlayer = new Map<string, number>();
  private currentPhase: GamePhase = 'preparation';
  private currentRound = 0;
  private currentPairings: RoundPairings = { pairs: [], resting: null };
  private pendingDuels: Duel[] = [];

  constructor(options: GameOptions) {
    if (options.players.length < MINIMUM_PLAYERS || options.players.length > MAXIMUM_PLAYERS) {
      throw new Error(`A partida precisa de ${MINIMUM_PLAYERS} a ${MAXIMUM_PLAYERS} jogadores.`);
    }
    this.seed = options.seed;
    this.roster = options.roster;
    this.config = options.config ?? DEFAULT_GAME_CONFIG;
    // A torre entra só aqui (não no elenco): a loja sorteia personagens do elenco e as torres à parte.
    this.charactersById = new Map([...options.roster, ...buildTowerCharacters(this.config.tower)].map((character) => [character.id, character]));
    this.synergies = options.synergies ?? DEFAULT_SYNERGIES;
    this.synergyMapping = options.synergyMapping;
    this.rotationIndex = options.rotationIndex;
    this.synergyRotation = options.synergyRotation ?? DEFAULT_SYNERGY_ROTATION;
    this.bottomPlayerId = options.bottomPlayerId;
    this.combatRules = options.combatRules;
    this.playerList = options.players.map((player) => createPlayerState(player, this.config.rounds.startingLives, this.config.economy.startingCoins));
    this.restDrawOrder = new SeededRandom(`${this.seed}:rest-order`).shuffled(this.playerList.map((player) => player.id));
    this.startRound();
  }

  // --- Consulta -----------------------------------------------------------------------------------

  get phase(): GamePhase {
    return this.currentPhase;
  }

  get round(): number {
    return this.currentRound;
  }

  get players(): readonly PlayerState[] {
    return this.playerList;
  }

  get alivePlayers(): PlayerState[] {
    return this.playerList.filter(isAlive);
  }

  /** Confrontos e descanso da rodada atual (definidos no início da preparação). */
  get pairings(): RoundPairings {
    return this.currentPairings;
  }

  get unitLimit(): number {
    return unitLimitForRound(this.config.rounds, this.currentRound);
  }

  get preparationSeconds(): number {
    return preparationSecondsForRound(this.config.rounds, this.currentRound);
  }

  get isFinished(): boolean {
    return this.currentPhase === 'finished';
  }

  get winnerId(): string | null {
    return this.isFinished ? (this.alivePlayers[0]?.id ?? null) : null;
  }

  get roundHistory(): readonly RoundRecord[] {
    return this.history;
  }

  getPlayer(playerId: string): PlayerState {
    const player = this.playerList.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error(`Jogador desconhecido: ${playerId}`);
    }
    return player;
  }

  getCharacter(characterId: string): CharacterDefinition {
    const character = this.charactersById.get(characterId);
    if (!character) {
      throw new Error(`Personagem desconhecido: ${characterId}`);
    }
    return character;
  }

  /** Adversário do jogador na rodada atual, ou `null` se ele descansa. */
  opponentOf(playerId: string): string | null {
    for (const [first, second] of this.currentPairings.pairs) {
      if (first === playerId) {
        return second;
      }
      if (second === playerId) {
        return first;
      }
    }
    return null;
  }

  /** Contagem e nível de cada sinergia para o que o jogador tem hoje no tabuleiro. */
  synergyStatusesOf(playerId: string): SynergyStatus[] {
    const boardCharacterIds = boardUnitsOf(this.getPlayer(playerId)).map((unit) => unit.characterId);
    return summarizeSynergies(boardCharacterIds, this.synergyMapping, this.synergies);
  }

  /** Colocação final: o vencedor é 1º; quem caiu na mesma rodada empata; quem durou mais fica à frente. */
  standings(): Standing[] {
    const survivalScore = (player: PlayerState) => player.eliminatedInRound ?? Number.POSITIVE_INFINITY;
    return this.playerList.map((player) => ({
      playerId: player.id,
      place: 1 + this.playerList.filter((other) => survivalScore(other) > survivalScore(player)).length,
    }));
  }

  // --- Ações do jogador (só na preparação) ---------------------------------------------------------

  buy(playerId: string, shopSlotIndex: number): ActionResult {
    return this.runAction(playerId, (player, context) => buyFromShop(player, context, shopSlotIndex));
  }

  refresh(playerId: string): ActionResult {
    return this.runAction(playerId, (player, context) => refreshShop(player, context));
  }

  toggleFreeze(playerId: string, shopSlotIndex: number): ActionResult {
    return this.runAction(playerId, (player) => toggleFreezeShopSlot(player, shopSlotIndex));
  }

  sell(playerId: string, unitId: string): ActionResult {
    return this.runAction(playerId, (player, context) => sellUnit(player, context, unitId));
  }

  move(playerId: string, unitId: string, destination: UnitLocation): ActionResult {
    return this.runAction(playerId, (player, context) => moveUnit(player, context, unitId, destination));
  }

  setReady(playerId: string, isReady: boolean): void {
    if (this.currentPhase === 'preparation') {
      this.getPlayer(playerId).ready = isReady;
    }
  }

  /** Quem abandona a partida passa a ser controlado como bot: mantém vidas, moedas, unidades e a vaga na tabela. */
  convertToBot(playerId: string): void {
    this.getPlayer(playerId).isBot = true;
  }

  get everyoneIsReady(): boolean {
    return this.alivePlayers.every((player) => player.ready);
  }

  private runAction(playerId: string, action: (player: PlayerState, context: ActionContext) => ActionResult): ActionResult {
    if (this.currentPhase !== 'preparation') {
      return { ok: false, reason: 'not_in_preparation' };
    }
    const player = this.getPlayer(playerId);
    return action(player, this.actionContextOf(player));
  }

  private actionContextOf(player: PlayerState): ActionContext {
    return { config: this.config, round: this.currentRound, roster: this.roster, shopRandom: this.shopRandomOf(player.id), towerRandom: this.towerRandomByPlayer.get(player.id) };
  }

  private shopRandomOf(playerId: string): SeededRandom {
    const random = this.shopRandomByPlayer.get(playerId);
    if (!random) {
      throw new Error(`Sem sorteio de loja para ${playerId}`);
    }
    return random;
  }

  // --- Andamento da partida -----------------------------------------------------------------------

  /** Encerra a preparação e simula todos os duelos da rodada. As vidas só mudam em `concludeRound`. */
  resolveCombats(): readonly Duel[] {
    if (this.currentPhase !== 'preparation') {
      throw new Error('Os combates só começam depois da preparação.');
    }
    this.currentPhase = 'combat';
    const context = this.combatSetupContext();
    this.pendingDuels = this.currentPairings.pairs.map(([first, second]) => {
      const [topId, bottomId] = this.orderForDisplay(first, second);
      const seed = `${this.seed}:combat:${this.currentRound}:${topId}:${bottomId}`;
      const combatConfig = buildCombatConfig(this.getPlayer(topId), this.getPlayer(bottomId), seed, context);
      return { topId, bottomId, combatConfig, result: new CombatSimulation(combatConfig).run() };
    });
    return this.pendingDuels;
  }

  /** Aplica os resultados: perda de vidas, eliminações e fim da partida. */
  concludeRound(): RoundSummary {
    if (this.currentPhase !== 'combat') {
      throw new Error('Não há combates para concluir.');
    }
    const duels = this.pendingDuels.map((duel) => this.applyDuelOutcome(duel));
    const towerLosses = this.removeDestroyedTowers();
    const eliminatedIds = this.eliminateDefeatedPlayers();
    this.history.push({ round: this.currentRound, pairs: this.currentPairings.pairs, resting: this.currentPairings.resting });
    this.currentPhase = this.alivePlayers.length <= 1 ? 'finished' : 'result';
    return { round: this.currentRound, duels, restingId: this.currentPairings.resting, eliminatedIds, towersLostByPlayerId: towerLosses.lostByPlayerId, towerCompensationByPlayerId: towerLosses.compensationByPlayerId };
  }

  /** Começa a preparação da rodada seguinte: renda, juros, nova loja e novos confrontos. */
  startNextRound(): void {
    if (this.currentPhase !== 'result') {
      throw new Error('A próxima rodada só começa depois do resultado.');
    }
    this.startRound();
  }

  private startRound(): void {
    this.currentRound++;
    this.currentPhase = 'preparation';
    this.pendingDuels = [];
    this.currentPairings = createPairings(
      this.alivePlayers.map((player) => player.id),
      this.history,
      this.restDrawOrder,
    );
    for (const player of this.alivePlayers) {
      player.coins = coinsAtRoundStart(this.config.economy, player.coins, this.currentRound) + towerIncomeOf(player, this.config.tower) + this.collectTowerCompensation(player.id);
      player.ready = false;
      this.shopRandomByPlayer.set(player.id, new SeededRandom(`${this.seed}:shop:${player.id}:${this.currentRound}`));
      this.towerRandomByPlayer.set(player.id, new SeededRandom(`${this.seed}:tower:${player.id}:${this.currentRound}`));
      refillShop(player, this.actionContextOf(player));
    }
  }

  private collectTowerCompensation(playerId: string): number {
    const coins = this.towerCompensationByPlayer.get(playerId) ?? 0;
    this.towerCompensationByPlayer.delete(playerId);
    return coins;
  }

  private combatSetupContext(): CombatSetupContext {
    const towerBuffsById = new Map(towerDefinitionsOf(this.config.tower).map((tower) => [tower.id, tower.buffs]));
    return { charactersById: this.charactersById, synergies: this.synergies, synergyMapping: this.synergyMapping, towerBuffsById, rules: this.combatRules };
  }

  /** Quem luta como lado A (`top`) e como lado B (`bottom`): o jogador escolhido, se estiver no duelo, é sempre o B. */
  private orderForDisplay(first: string, second: string): [string, string] {
    if (first === this.bottomPlayerId) {
      return [second, first];
    }
    if (second === this.bottomPlayerId) {
      return [first, second];
    }
    // Nos demais duelos o lado é sorteado: o lado A leva uma pequena vantagem, e o mesmo lugar ficaria sempre nele.
    const isSwapped = new SeededRandom(`${this.seed}:sides:${this.currentRound}:${first}:${second}`).chance(0.5);
    return isSwapped ? [second, first] : [first, second];
  }

  private applyDuelOutcome(duel: Duel): DuelOutcome {
    const { winner } = duel.result;
    if (winner === 'draw') {
      return { topId: duel.topId, bottomId: duel.bottomId, winnerId: null, loserId: null, livesLost: 0, result: duel.result };
    }
    const winnerId = winner === 'A' ? duel.topId : duel.bottomId;
    const loserId = winner === 'A' ? duel.bottomId : duel.topId;
    const livesLost = livesLostOnDefeat(this.config.rounds, this.currentRound);
    const loser = this.getPlayer(loserId);
    loser.lives = Math.max(0, loser.lives - livesLost);
    return { topId: duel.topId, bottomId: duel.bottomId, winnerId, loserId, livesLost, result: duel.result };
  }

  /** Torres destruídas no combate saem do jogador de vez, mesmo que ele tenha vencido. */
  private removeDestroyedTowers(): TowerLosses {
    const lostByPlayerId: Record<string, number> = {};
    const compensationByPlayerId: Record<string, number> = {};
    for (const duel of this.pendingDuels) {
      const destroyedIds = new Set(duel.result.destroyedStructureIds);
      const sides = [
        { side: 'A', playerId: duel.topId },
        { side: 'B', playerId: duel.bottomId },
      ] as const;
      for (const { side, playerId } of sides) {
        const player = this.getPlayer(playerId);
        const lostTowers = player.units.filter((unit) => isTowerId(unit.characterId) && destroyedIds.has(combatUnitId(side, unit)));
        if (lostTowers.length > 0) {
          player.units = player.units.filter((unit) => !lostTowers.includes(unit));
          lostByPlayerId[playerId] = (lostByPlayerId[playerId] ?? 0) + lostTowers.length;
          const compensation = lostTowers.reduce((total, unit) => total + towerDefinitionOf(this.config.tower, unit.characterId).compensationOnLoss, 0);
          compensationByPlayerId[playerId] = (compensationByPlayerId[playerId] ?? 0) + compensation;
          this.towerCompensationByPlayer.set(playerId, (this.towerCompensationByPlayer.get(playerId) ?? 0) + compensation);
        }
      }
    }
    return { lostByPlayerId, compensationByPlayerId };
  }

  private eliminateDefeatedPlayers(): string[] {
    const eliminated = this.playerList.filter((player) => isAlive(player) && player.lives <= 0);
    eliminated.forEach((player) => {
      player.eliminatedInRound = this.currentRound;
    });
    return eliminated.map((player) => player.id);
  }
}
