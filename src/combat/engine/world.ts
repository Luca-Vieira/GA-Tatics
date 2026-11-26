import type { BoardSide } from '@shared/constants/board';
import type { Hex } from '@shared/utils/hex';
import type { SeededRandom } from '@shared/utils/random';
import type { StatusSpec } from '../effects/status';
import type { BaseStats } from '../units/stats';
import type { CombatUnit } from '../units/unit';
import type { CombatEvent, DamageCause } from './events';

export interface DamageOptions {
  readonly cause: DamageCause;
  /** Ignora resistência e reduções (dano contínuo, como veneno e drenagem). */
  readonly ignoreMitigation?: boolean;
}

export interface TrapRequest {
  readonly ownerId: string;
  readonly side: BoardSide;
  readonly cell: Hex;
  readonly triggerRadius: number;
  readonly armingMs: number;
  readonly lifetimeMs: number;
  readonly starMultiplier: number;
  readonly summon: { readonly name: string; readonly stats: BaseStats; readonly count: number; readonly lifetimeMs: number };
}

export interface SummonSpawnRequest {
  readonly ownerId: string;
  readonly side: BoardSide;
  /** As criaturas ocupam as casas livres mais próximas daqui; empates vão para o lado de `towards`. */
  readonly anchor: Hex;
  readonly towards: Hex;
  /** Multiplicador de estrela de quem invocou: as criaturas escalam junto. */
  readonly starMultiplier: number;
  readonly summon: { readonly name: string; readonly stats: BaseStats; readonly count: number; readonly lifetimeMs: number };
}

export interface DecoyRequest {
  readonly ownerId: string;
  readonly side: BoardSide;
  readonly cell: Hex;
  readonly name: string;
  readonly stats: BaseStats;
  /** Multiplicador de estrela de quem invocou: o clone fica mais resistente junto com ele. */
  readonly starMultiplier: number;
  readonly lifetimeMs: number;
  readonly tauntRadius: number;
}

/** O que habilidades e efeitos podem consultar e alterar no combate. Implementado por `CombatSimulation`. */
export interface CombatWorld {
  readonly nowMs: number;
  readonly random: SeededRandom;
  readonly units: readonly CombatUnit[];
  emit(event: CombatEvent): void;
  /** Aplica o dano e devolve a vida realmente perdida. */
  dealDamage(source: CombatUnit | null, target: CombatUnit, rawDamage: number, options: DamageOptions): number;
  /** Recupera vida (até o máximo) e devolve o quanto foi curado. */
  heal(source: CombatUnit | null, target: CombatUnit, amount: number): number;
  applyStatus(source: CombatUnit, target: CombatUnit, spec: StatusSpec): void;
  placeTrap(request: TrapRequest): void;
  /** Coloca as criaturas invocadas no tabuleiro (menos, se faltar casa livre). */
  spawnSummons(request: SummonSpawnRequest): void;
  /** Cria um clone provocador na casa indicada (que deve estar livre). */
  spawnDecoy(request: DecoyRequest): void;
  isCellFree(cell: Hex): boolean;
}
