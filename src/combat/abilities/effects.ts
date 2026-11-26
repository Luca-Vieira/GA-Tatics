import { PERIODIC_STATUS_KINDS, type EffectDefinition, type StatusKind } from '@data/schemas/ability';
import { BOARD_CELLS } from '@shared/constants/board';
import { hexDistance } from '@shared/utils/hex';
import { computeOutgoingDamageMultiplier } from '../effects/modifiers';
import type { CombatWorld } from '../engine/world';
import type { CombatUnit } from '../units/unit';
import type { CastContext } from './castContext';
import { castLShapedProjectile } from './lShapedProjectile';

type TargetedEffect = Extract<EffectDefinition, { targets: string }>;

/** Executa, em ordem, todos os efeitos de uma habilidade. */
export function applyAbilityEffects(world: CombatWorld, cast: CastContext): void {
  for (const effect of cast.ability.effects) {
    applyEffect(world, cast, effect);
  }
}

function applyEffect(world: CombatWorld, cast: CastContext, effect: EffectDefinition): void {
  switch (effect.type) {
    case 'damage':
      applyDamageEffect(world, cast, effect);
      return;
    case 'heal':
      applyHealEffect(world, cast, effect);
      return;
    case 'status':
      applyStatusEffect(world, cast, effect);
      return;
    case 'place_trap':
      applyTrapEffect(world, cast, effect);
      return;
    case 'summon':
      applySummonEffect(world, cast, effect);
      return;
    case 'summon_decoy':
      applyDecoyEffect(world, cast, effect);
      return;
    case 'registered':
      applyRegisteredEffect(world, cast, effect.behavior);
      return;
  }
}

function applyDamageEffect(world: CombatWorld, cast: CastContext, effect: Extract<EffectDefinition, { type: 'damage' }>): void {
  const rawDamage = cast.caster.stats.damage * computeOutgoingDamageMultiplier(cast.caster) * effect.multiplier;
  for (const target of resolveTargets(world, cast, effect)) {
    world.dealDamage(cast.caster, target, rawDamage, { cause: 'ability' });
  }
}

function applyHealEffect(world: CombatWorld, cast: CastContext, effect: Extract<EffectDefinition, { type: 'heal' }>): void {
  for (const target of resolveTargets(world, cast, effect)) {
    world.heal(cast.caster, target, target.stats.maxHealth * effect.fractionOfMaxHealth * cast.caster.positiveEffectMultiplier);
  }
}

/** Estados que beneficiam quem os recebe; a amplificação de efeitos positivos (Gestão) os fortalece. */
const POSITIVE_STATUS_KINDS: readonly StatusKind[] = ['damage_reduction', 'speed_boost', 'damage_boost'];

function amplifyIfPositive(status: StatusKind, value: number, caster: CombatUnit): number {
  return POSITIVE_STATUS_KINDS.includes(status) ? value * caster.positiveEffectMultiplier : value;
}

function applyStatusEffect(world: CombatWorld, cast: CastContext, effect: Extract<EffectDefinition, { type: 'status' }>): void {
  const isPeriodic = PERIODIC_STATUS_KINDS.includes(effect.status);
  // Veneno e drenagem guardam o dano por pulso já calculado com o dano do autor no momento do uso.
  const intensity = effect.value ?? 0;
  const value = isPeriodic
    ? cast.caster.stats.damage * computeOutgoingDamageMultiplier(cast.caster) * intensity
    : amplifyIfPositive(effect.status, intensity, cast.caster);
  const charges = effect.charges ?? (effect.status === 'confuse' ? 1 : null);

  for (const target of resolveTargets(world, cast, effect)) {
    world.applyStatus(cast.caster, target, {
      kind: effect.status,
      durationMs: effect.durationSeconds * 1000,
      value,
      tickMs: effect.tickSeconds === undefined ? null : effect.tickSeconds * 1000,
      charges,
      healRatio: effect.healRatio ?? 0,
    });
  }
}

/** Planta a armadilha na casa livre, ao alcance do autor, mais próxima do alvo. */
function applyTrapEffect(world: CombatWorld, cast: CastContext, effect: Extract<EffectDefinition, { type: 'place_trap' }>): void {
  const { caster, center, ability } = cast;
  const trapCell = BOARD_CELLS.filter((cell) => world.isCellFree(cell) && hexDistance(caster.cell, cell) <= ability.cast.range)
    .sort((first, second) => hexDistance(first, center) - hexDistance(second, center) || first.r - second.r || first.q - second.q)[0];
  if (!trapCell) {
    return;
  }
  world.placeTrap({
    ownerId: caster.id,
    side: caster.side,
    cell: trapCell,
    triggerRadius: effect.triggerRadius,
    armingMs: effect.armingSeconds * 1000,
    lifetimeMs: effect.lifetimeSeconds * 1000,
    starMultiplier: caster.starMultiplier,
    summon: {
      name: effect.summon.name,
      stats: effect.summon.stats,
      count: effect.summon.count,
      lifetimeMs: effect.summon.lifetimeSeconds * 1000,
    },
  });
}

/** Invocação direta: sem armadilha, as criaturas surgem junto de quem invocou. */
function applySummonEffect(world: CombatWorld, cast: CastContext, effect: Extract<EffectDefinition, { type: 'summon' }>): void {
  const { caster, center } = cast;
  world.spawnSummons({
    ownerId: caster.id,
    side: caster.side,
    anchor: caster.cell,
    towards: center,
    starMultiplier: caster.starMultiplier,
    summon: {
      name: effect.summon.name,
      stats: effect.summon.stats,
      count: effect.summon.count,
      lifetimeMs: effect.summon.lifetimeSeconds * 1000,
    },
  });
}

/** O clone aparece na casa livre, perto de quem invocou, mais próxima do alvo da habilidade (fica "na frente"). */
function applyDecoyEffect(world: CombatWorld, cast: CastContext, effect: Extract<EffectDefinition, { type: 'summon_decoy' }>): void {
  const { caster, center } = cast;
  const decoyCell = BOARD_CELLS.filter((cell) => world.isCellFree(cell) && hexDistance(caster.cell, cell) <= effect.placementRange)
    .sort((first, second) => hexDistance(first, center) - hexDistance(second, center) || first.r - second.r || first.q - second.q)[0];
  if (!decoyCell) {
    return;
  }
  world.spawnDecoy({
    ownerId: caster.id,
    side: caster.side,
    cell: decoyCell,
    name: effect.name,
    stats: { health: effect.health, damage: 1, attackSpeed: 1, range: 1, mobility: 1 },
    starMultiplier: caster.starMultiplier,
    lifetimeMs: effect.lifetimeSeconds * 1000,
    tauntRadius: effect.tauntRadius,
  });
}

function applyRegisteredEffect(world: CombatWorld, cast: CastContext, behavior: Extract<EffectDefinition, { type: 'registered' }>['behavior']): void {
  switch (behavior.id) {
    case 'l_shaped_projectile':
      castLShapedProjectile(world, cast, behavior);
      return;
    case 'random_attack':
    case 'missing_health_haste':
      // Atuam continuamente (no ataque e nos modificadores), não no momento do uso.
      return;
  }
}

/** Quem recebe o efeito, na ordem em que será afetado (limitada por `maxTargets`). */
export function resolveTargets(world: CombatWorld, cast: CastContext, effect: TargetedEffect): CombatUnit[] {
  const candidates = selectCandidates(world, cast, effect.targets);
  const ordered = effect.prioritize === 'lowest_health_ratio' ? sortByHealthRatio(candidates, cast) : sortByDistanceToCenter(candidates, cast);
  return effect.maxTargets === undefined ? ordered : ordered.slice(0, effect.maxTargets);
}

function selectCandidates(world: CombatWorld, cast: CastContext, selector: TargetedEffect['targets']): CombatUnit[] {
  const { caster, center, ability } = cast;
  const areaRadius = ability.cast.areaRadius;
  const isInArea = (unit: CombatUnit) => unit.alive && hexDistance(center, unit.cell) <= areaRadius;

  switch (selector) {
    case 'self':
      return [caster];
    case 'center_unit':
      return cast.primary?.alive ? [cast.primary] : [];
    case 'enemies_in_area':
      return world.units.filter((unit) => unit.side !== caster.side && isInArea(unit));
    case 'allies_in_area':
      return world.units.filter((unit) => unit.side === caster.side && isInArea(unit));
  }
}

function sortByDistanceToCenter(units: CombatUnit[], cast: CastContext): CombatUnit[] {
  return [...units].sort((first, second) => hexDistance(cast.center, first.cell) - hexDistance(cast.center, second.cell) || compareIds(first, second));
}

function sortByHealthRatio(units: CombatUnit[], cast: CastContext): CombatUnit[] {
  const healthRatio = (unit: CombatUnit) => unit.health / unit.stats.maxHealth;
  return [...units].sort(
    (first, second) => healthRatio(first) - healthRatio(second) || hexDistance(cast.center, first.cell) - hexDistance(cast.center, second.cell) || compareIds(first, second),
  );
}

function compareIds(first: CombatUnit, second: CombatUnit): number {
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}
