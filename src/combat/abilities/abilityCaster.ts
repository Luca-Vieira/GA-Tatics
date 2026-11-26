import type { AbilityDefinition } from '@data/schemas/ability';
import { hexDistance, type Hex } from '@shared/utils/hex';
import type { CombatWorld } from '../engine/world';
import { countsForResult, turnTowards, type CombatUnit } from '../units/unit';
import type { CastContext } from './castContext';
import { applyAbilityEffects } from './effects';

/** Abaixo desta fração da vida, um aliado conta como ferido (condição "ally_wounded"). */
const WOUNDED_HEALTH_FRACTION = 0.9;

interface CastTarget {
  readonly center: Hex;
  readonly primary: CombatUnit;
}

/** Usa a habilidade do personagem se ela estiver pronta e tiver onde atuar. Devolve verdadeiro se usou. */
export function tryCastReadyAbility(world: CombatWorld, unit: CombatUnit, currentTarget: CombatUnit | null): boolean {
  const ability = unit.ability;
  if (!ability || !isReadyToCast(world, unit, ability)) {
    return false;
  }
  const castTarget = resolveCastTarget(world, unit, ability, currentTarget);
  if (!castTarget) {
    return false;
  }
  castAbility(world, { caster: unit, ability, center: castTarget.center, primary: castTarget.primary });
  return true;
}

/** Ativação "primeiro golpe": dispara junto com o primeiro ataque que acerta cada alvo. */
export function castOnFirstHit(world: CombatWorld, attacker: CombatUnit, target: CombatUnit): void {
  const ability = attacker.ability;
  const isFirstHitAbility = ability?.activation.type === 'first_hit_on_target';
  if (!ability || !isFirstHitAbility || attacker.ambushedTargetIds.has(target.id)) {
    return;
  }
  attacker.ambushedTargetIds.add(target.id);
  castAbility(world, { caster: attacker, ability, center: target.cell, primary: target });
}

function castAbility(world: CombatWorld, cast: CastContext): void {
  const { caster, ability } = cast;
  turnTowards(caster, cast.center);
  world.emit({
    type: 'ability',
    timeMs: world.nowMs,
    casterId: caster.id,
    abilityName: ability.name,
    center: cast.center,
    radius: ability.cast.areaRadius,
    visual: ability.visual,
    facing: caster.facing,
  });
  applyAbilityEffects(world, cast);

  caster.abilityUsed = true;
  caster.abilityReadyAtMs = world.nowMs + ability.cooldownSeconds * 1000 * caster.cooldownMultiplier;
  const busyUntilMs = world.nowMs + ability.cast.castTimeMs;
  caster.nextAttackAtMs = Math.max(caster.nextAttackAtMs, busyUntilMs);
  caster.nextMoveAtMs = Math.max(caster.nextMoveAtMs, busyUntilMs);
}

function isReadyToCast(world: CombatWorld, unit: CombatUnit, ability: AbilityDefinition): boolean {
  if (world.nowMs < unit.abilityReadyAtMs) {
    return false;
  }
  const { activation } = ability;
  switch (activation.type) {
    case 'cooldown':
      return meetsRequirement(world, unit, ability, activation.requires);
    case 'health_threshold':
      return !unit.abilityUsed && unit.health <= unit.stats.maxHealth * activation.belowFraction;
    case 'first_hit_on_target':
    case 'passive':
      return false;
  }
}

function meetsRequirement(world: CombatWorld, unit: CombatUnit, ability: AbilityDefinition, requirement: 'always' | 'ally_wounded' | 'ally_fallen'): boolean {
  switch (requirement) {
    case 'always':
      return true;
    case 'ally_wounded':
      return world.units.some(
        (ally) =>
          ally.alive &&
          ally.side === unit.side &&
          hexDistance(unit.cell, ally.cell) <= ability.cast.areaRadius &&
          ally.health < ally.stats.maxHealth * WOUNDED_HEALTH_FRACTION,
      );
    case 'ally_fallen':
      return world.units.some((ally) => ally.side === unit.side && countsForResult(ally) && !ally.alive);
  }
}

/** Define o ponto central do efeito; devolve null se não houver onde usar a habilidade agora. */
function resolveCastTarget(world: CombatWorld, unit: CombatUnit, ability: AbilityDefinition, currentTarget: CombatUnit | null): CastTarget | null {
  switch (ability.cast.target) {
    case 'self':
      return { center: unit.cell, primary: unit };
    case 'current_target':
      return currentTarget && isWithinCastRange(unit, currentTarget, ability) ? { center: currentTarget.cell, primary: currentTarget } : null;
    case 'nearest_enemy':
      return toCastTarget(findNearestEnemyInRange(world, unit, ability));
    case 'enemy_cluster':
      return toCastTarget(findClusterCenter(world, unit, ability));
  }
}

function toCastTarget(unit: CombatUnit | null): CastTarget | null {
  return unit ? { center: unit.cell, primary: unit } : null;
}

function isWithinCastRange(caster: CombatUnit, target: CombatUnit, ability: AbilityDefinition): boolean {
  return hexDistance(caster.cell, target.cell) <= ability.cast.range;
}

function enemiesInCastRange(world: CombatWorld, unit: CombatUnit, ability: AbilityDefinition): CombatUnit[] {
  return world.units.filter((enemy) => enemy.alive && enemy.side !== unit.side && isWithinCastRange(unit, enemy, ability));
}

function findNearestEnemyInRange(world: CombatWorld, unit: CombatUnit, ability: AbilityDefinition): CombatUnit | null {
  const enemies = enemiesInCastRange(world, unit, ability);
  enemies.sort((first, second) => hexDistance(unit.cell, first.cell) - hexDistance(unit.cell, second.cell) || (first.id < second.id ? -1 : 1));
  return enemies[0] ?? null;
}

/** Inimigo ao alcance cujo entorno (raio da área) reúne mais inimigos; empate pelo mais próximo e depois pelo id. */
function findClusterCenter(world: CombatWorld, unit: CombatUnit, ability: AbilityDefinition): CombatUnit | null {
  const enemies = enemiesInCastRange(world, unit, ability);
  const allEnemies = world.units.filter((enemy) => enemy.alive && enemy.side !== unit.side);
  const clusterSize = (center: CombatUnit) => allEnemies.filter((enemy) => hexDistance(center.cell, enemy.cell) <= ability.cast.areaRadius).length;

  enemies.sort(
    (first, second) =>
      clusterSize(second) - clusterSize(first) ||
      hexDistance(unit.cell, first.cell) - hexDistance(unit.cell, second.cell) ||
      (first.id < second.id ? -1 : 1),
  );
  return enemies[0] ?? null;
}
