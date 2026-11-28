import { auxiliarySpriteKeyOf } from '@data/auxiliarySprites';
import { DEFAULT_ATTACK } from '@data/schemas/attack';
import type { BoardSide } from '@shared/constants/board';
import { DEFAULT_ATTACK_SWEEP, defaultFacingOf } from '@shared/utils/attackArea';
import type { Hex } from '@shared/utils/hex';
import { INITIAL_ABILITY_DELAY_MS } from '../engine/constants';
import { NO_BONUSES } from './bonuses';
import { STAR_MULTIPLIERS, toCombatStats, type BaseStats } from './stats';
import { DEFAULT_BEHAVIOR, type CombatUnit, type UnitSpec } from './unit';

export function createCombatUnit(spec: UnitSpec): CombatUnit {
  const starLevel = spec.starLevel ?? 1;
  const starMultipliers = spec.starMultipliers ?? STAR_MULTIPLIERS;
  const bonuses = spec.bonuses ?? NO_BONUSES;
  const baseCombatStats = toCombatStats(spec.stats, starLevel, starMultipliers);
  const stats = {
    ...baseCombatStats,
    maxHealth: baseCombatStats.maxHealth * bonuses.maxHealthMultiplier,
    damage: baseCombatStats.damage * bonuses.damageMultiplier,
    attacksPerSecond: baseCombatStats.attacksPerSecond * bonuses.attackSpeedMultiplier,
  };
  return {
    id: spec.id,
    name: spec.name,
    characterId: spec.characterId ?? null,
    side: spec.side,
    stats,
    behavior: spec.behavior ?? DEFAULT_BEHAVIOR,
    ability: spec.ability ?? null,
    attack: spec.attack ?? DEFAULT_ATTACK,
    // Cada tipo de torre tem o próprio sprite, guardado com o id dela.
    auxiliarySpriteKey: spec.isStructure ? (spec.characterId ?? auxiliarySpriteKeyOf(spec.name)) : null,
    starLevel,
    starMultiplier: starMultipliers[starLevel],
    cell: spec.cell,
    health: stats.maxHealth,
    resistance: bonuses.resistance,
    alive: true,
    targetId: null,
    facing: defaultFacingOf(spec.side),
    sweep: DEFAULT_ATTACK_SWEEP,
    hasReachedTarget: false,
    nextAttackAtMs: 0,
    nextMoveAtMs: 0,
    abilityReadyAtMs: INITIAL_ABILITY_DELAY_MS,
    cooldownMultiplier: 1 - bonuses.cooldownReduction,
    positiveEffectMultiplier: 1 + bonuses.positiveEffectAmplification,
    regenFraction: bonuses.regenFraction,
    regenIntervalMs: bonuses.regenIntervalMs,
    nextRegenAtMs: bonuses.regenIntervalMs,
    abilityUsed: false,
    statuses: [],
    ambushedTargetIds: new Set(),
    isSummon: false,
    isDecoy: false,
    tauntRadius: 0,
    isStructure: spec.isStructure ?? false,
    ownerId: null,
    expiresAtMs: null,
  };
}

export interface SummonRequest {
  readonly id: string;
  readonly name: string;
  readonly side: BoardSide;
  readonly cell: Hex;
  readonly stats: BaseStats;
  /** Multiplicador de estrela do invocador: invocações escalam junto com ele. */
  readonly starMultiplier: number;
  readonly ownerId: string;
  readonly expiresAtMs: number;
  /** Se existir, a invocação é um clone provocador (não age; atrai inimigos a até esta distância). */
  readonly decoyTauntRadius?: number;
}

/** Unidade temporária invocada por uma habilidade: persegue o inimigo mais próximo e some ao fim da duração. */
export function createSummonUnit(request: SummonRequest): CombatUnit {
  const baseStats = toCombatStats(request.stats);
  const stats = {
    ...baseStats,
    maxHealth: baseStats.maxHealth * request.starMultiplier,
    damage: baseStats.damage * request.starMultiplier,
  };
  return {
    ...createCombatUnit({ id: request.id, name: request.name, side: request.side, cell: request.cell, stats: request.stats }),
    stats,
    health: stats.maxHealth,
    auxiliarySpriteKey: auxiliarySpriteKeyOf(request.name),
    starMultiplier: request.starMultiplier,
    isSummon: true,
    isDecoy: request.decoyTauntRadius !== undefined,
    tauntRadius: request.decoyTauntRadius ?? 0,
    ownerId: request.ownerId,
    expiresAtMs: request.expiresAtMs,
  };
}
