import type { AbilityDefinition } from '@data/schemas/ability';
import type { BehaviorProfile } from '@data/schemas/character';
import type { BoardSide } from '@shared/constants/board';
import type { Hex } from '@shared/utils/hex';
import type { StatusInstance } from '../effects/status';
import type { TeamBonuses } from './bonuses';
import type { BaseStats, CombatStats, StarLevel, StarMultipliers } from './stats';

/** Comportamento das unidades sem perfil próprio: persegue o inimigo mais próximo. */
export const DEFAULT_BEHAVIOR: BehaviorProfile = { movement: 'chase', targetPriority: 'nearest', preferredDistance: 1 };

/** Descrição de uma unidade no início do combate. */
export interface UnitSpec {
  readonly id: string;
  readonly name: string;
  readonly side: BoardSide;
  readonly cell: Hex;
  readonly stats: BaseStats;
  readonly starLevel?: StarLevel;
  readonly starMultipliers?: StarMultipliers;
  readonly behavior?: BehaviorProfile;
  readonly ability?: AbilityDefinition;
  /** Id do personagem no elenco, quando a unidade vem de uma definição. */
  readonly characterId?: string;
  /** Bônus de equipe (sinergias) aplicados no início do combate. Sem eles, a unidade usa só os próprios atributos. */
  readonly bonuses?: TeamBonuses;
  /** Estrutura (a torre): não se move nem ataca, pode ser atacada e não segura o combate. */
  readonly isStructure?: boolean;
}

/** Estado de uma unidade durante o combate. */
export interface CombatUnit {
  readonly id: string;
  readonly name: string;
  /** Personagem do elenco que originou a unidade (`null` nas invocações); a interface o usa para escolher o sprite. */
  readonly characterId: string | null;
  readonly side: BoardSide;
  readonly stats: CombatStats;
  readonly behavior: BehaviorProfile;
  readonly ability: AbilityDefinition | null;
  readonly starLevel: StarLevel;
  /** Multiplicador de estrela aplicado à vida e ao dano. */
  readonly starMultiplier: number;
  cell: Hex;
  health: number;
  /** Redução percentual de dano recebido (0 a 1). Modificada por efeitos, como a sinergia Operacional. */
  resistance: number;
  alive: boolean;
  targetId: string | null;
  nextAttackAtMs: number;
  nextMoveAtMs: number;
  abilityReadyAtMs: number;
  /** Multiplicador do tempo de recarga das habilidades (1 − redução de recarga). */
  readonly cooldownMultiplier: number;
  /** Multiplicador dos efeitos positivos das habilidades (1 + amplificação). */
  readonly positiveEffectMultiplier: number;
  /** Regeneração periódica (fração da vida máxima a cada intervalo); intervalo 0 = sem regeneração. */
  readonly regenFraction: number;
  readonly regenIntervalMs: number;
  nextRegenAtMs: number;
  /** A habilidade já foi usada ao menos uma vez (usado pelas ativações de uso único). */
  abilityUsed: boolean;
  statuses: StatusInstance[];
  /** Alvos em que a ativação "primeiro golpe" já foi usada. */
  ambushedTargetIds: Set<string>;
  /** Unidades invocadas não contam para a eliminação nem para o resultado. */
  readonly isSummon: boolean;
  /** Clone provocador: não age, só serve de alvo para os inimigos que estiverem a até `tauntRadius` casas dele. */
  readonly isDecoy: boolean;
  readonly tauntRadius: number;
  /** Estruturas também não contam para a eliminação nem para o resultado; só servem de alvo. */
  readonly isStructure: boolean;
  readonly ownerId: string | null;
  readonly expiresAtMs: number | null;
}

/** Só as unidades colocadas pelo jogador (nem invocações, nem estruturas) decidem o fim e o resultado do combate. */
export function countsForResult(unit: Pick<CombatUnit, 'isSummon' | 'isStructure'>): boolean {
  return !unit.isSummon && !unit.isStructure;
}
