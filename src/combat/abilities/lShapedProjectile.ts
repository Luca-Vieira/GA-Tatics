import { hexDistance } from '@shared/utils/hex';
import { computeOutgoingDamageMultiplier } from '../effects/modifiers';
import type { CombatWorld } from '../engine/world';
import type { CombatUnit } from '../units/unit';
import type { CastContext } from './castContext';
import type { BehaviorOf } from './registeredBehaviors';

/** Tiro em L (João Lucas): acerta o alvo e muda de direção para atingir um segundo inimigo próximo a ele. */
export function castLShapedProjectile(world: CombatWorld, cast: CastContext, behavior: BehaviorOf<'l_shaped_projectile'>): void {
  const { caster, primary } = cast;
  if (!primary) {
    return;
  }
  const baseDamage = caster.stats.damage * computeOutgoingDamageMultiplier(caster);

  const icon = cast.ability.visual.projectileIcon;
  world.emit({ type: 'projectile', timeMs: world.nowMs, fromId: caster.id, toId: primary.id, icon });
  world.dealDamage(caster, primary, baseDamage * behavior.primaryMultiplier, { cause: 'ability' });

  const secondary = findClosestEnemyTo(world, caster, primary, behavior.redirectRange);
  if (!secondary) {
    return;
  }
  world.emit({ type: 'projectile', timeMs: world.nowMs, fromId: primary.id, toId: secondary.id, icon });
  world.dealDamage(caster, secondary, baseDamage * behavior.secondaryMultiplier, { cause: 'ability' });
}

function findClosestEnemyTo(world: CombatWorld, caster: CombatUnit, origin: CombatUnit, maximumDistance: number): CombatUnit | null {
  let closest: CombatUnit | null = null;
  let closestDistance = Infinity;
  for (const candidate of world.units) {
    if (!candidate.alive || candidate.side === caster.side || candidate.id === origin.id) {
      continue;
    }
    const distance = hexDistance(origin.cell, candidate.cell);
    const isWithinReach = distance <= maximumDistance;
    const isBetter = distance < closestDistance || (distance === closestDistance && closest !== null && candidate.id < closest.id);
    if (isWithinReach && isBetter) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}
