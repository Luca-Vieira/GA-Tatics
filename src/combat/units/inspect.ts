/**
 * Retrato de uma unidade durante o combate, para o painel de consulta. Só lê o estado: pode ser chamado a cada quadro
 * sobre `CombatSimulation.getUnits()`, sem influenciar o resultado.
 */
import type { StatusKind, AbilityDefinition } from '@data/schemas/ability';
import type { AttackDefinition } from '@data/schemas/attack';
import { attackAreaCells, describeAttackArea, type AttackFacing } from '@shared/utils/attackArea';
import type { Hex } from '@shared/utils/hex';
import { computeModifiers } from '../effects/modifiers';
import { calculateDamageTaken } from './damage';
import type { CombatUnit } from './unit';

export const STATUS_LABELS: Readonly<Record<StatusKind, string>> = {
  poison: 'Envenenado',
  drain: 'Sendo drenado',
  slow: 'Lento',
  sleep: 'Dormindo',
  weaken: 'Enfraquecido',
  confuse: 'Confuso',
  damage_reduction: 'Protegido',
  speed_boost: 'Acelerado',
  damage_boost: 'Dano aumentado',
  resting: 'Descansando',
};

export interface CombatUnitInspection {
  readonly id: string;
  readonly name: string;
  readonly alive: boolean;
  readonly health: number;
  readonly maxHealth: number;
  /** Valores já com estados e passivas; `base…` são os do início do combate (com estrela e sinergias). */
  readonly damage: number;
  readonly baseDamage: number;
  readonly attacksPerSecond: number;
  readonly baseAttacksPerSecond: number;
  readonly hexesPerSecond: number;
  readonly range: number;
  /** Redução total de dano recebido (0 a 1): resistência e habilidades combinadas. */
  readonly damageReduction: number;
  readonly attack: AttackDefinition;
  readonly attackDescription: string;
  /** Casas que o ataque cobre agora, a partir da casa atual e virado para onde a unidade olha. */
  readonly attackAreaCells: readonly Hex[];
  readonly facing: AttackFacing;
  readonly ability: AbilityDefinition | null;
  /** Segundos até a habilidade ficar pronta (0 = pronta). */
  readonly abilityReadyInSeconds: number;
  readonly statuses: readonly { readonly kind: StatusKind; readonly label: string; readonly remainingSeconds: number }[];
  /** Estruturas não atacam nem se movem; invocações e clones são temporários. */
  readonly isStructure: boolean;
  readonly isSummon: boolean;
  readonly isDecoy: boolean;
}

export function inspectCombatUnit(unit: Readonly<CombatUnit>, nowMs: number): CombatUnitInspection {
  const modifiers = computeModifiers(unit as CombatUnit);
  const cannotAttack = unit.isStructure || unit.isDecoy;
  return {
    id: unit.id,
    name: unit.name,
    alive: unit.alive,
    health: unit.health,
    maxHealth: unit.stats.maxHealth,
    damage: cannotAttack ? 0 : unit.stats.damage * modifiers.damageMultiplier,
    baseDamage: cannotAttack ? 0 : unit.stats.damage,
    attacksPerSecond: cannotAttack ? 0 : unit.stats.attacksPerSecond * modifiers.attackSpeedMultiplier,
    baseAttacksPerSecond: cannotAttack ? 0 : unit.stats.attacksPerSecond,
    hexesPerSecond: cannotAttack ? 0 : unit.stats.hexesPerSecond * modifiers.moveSpeedMultiplier,
    range: cannotAttack ? 0 : unit.stats.range,
    damageReduction: 1 - calculateDamageTaken(1, unit.resistance, modifiers.damageReduction),
    attack: unit.attack,
    attackDescription: cannotAttack ? 'Não ataca.' : describeAttackArea(unit.attack.shape, unit.stats.range, unit.attack.maxTargets, unit.attack.splashDamageFraction),
    attackAreaCells: cannotAttack ? [] : attackAreaCells(unit.cell, unit.attack.shape, unit.stats.range, unit.facing, unit.sweep),
    facing: unit.facing,
    ability: unit.ability,
    abilityReadyInSeconds: Math.max(0, unit.abilityReadyAtMs - nowMs) / 1000,
    statuses: unit.statuses.map((status) => ({ kind: status.kind, label: STATUS_LABELS[status.kind], remainingSeconds: Math.max(0, status.endsAtMs - nowMs) / 1000 })),
    isStructure: unit.isStructure,
    isSummon: unit.isSummon,
    isDecoy: unit.isDecoy,
  };
}
