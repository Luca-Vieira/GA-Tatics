import type { AbilityDefinition, RegisteredBehavior } from '@data/schemas/ability';
import type { SeededRandom } from '@shared/utils/random';
import type { CombatUnit } from '../units/unit';

/**
 * Comportamentos com implementação própria (GDD 7.4). O painel escolhe um pelo id e configura os parâmetros;
 * nenhum código arbitrário é executado. O tiro em L fica em `lShapedProjectile.ts`.
 */

export type BehaviorOf<Id extends RegisteredBehavior['id']> = Extract<RegisteredBehavior, { id: Id }>;

export function findRegisteredBehavior<Id extends RegisteredBehavior['id']>(ability: AbilityDefinition | null, id: Id): BehaviorOf<Id> | undefined {
  if (!ability) {
    return undefined;
  }
  for (const effect of ability.effects) {
    if (effect.type === 'registered' && effect.behavior.id === id) {
      return effect.behavior as BehaviorOf<Id>;
    }
  }
  return undefined;
}

/** Multiplicadores passivos de dano e velocidade de ataque (hoje: Fúria do Vinícius). */
export function passiveModifiers(unit: CombatUnit): { damageMultiplier: number; attackSpeedMultiplier: number } {
  const haste = findRegisteredBehavior(unit.ability, 'missing_health_haste');
  if (!haste) {
    return { damageMultiplier: 1, attackSpeedMultiplier: 1 };
  }
  const healthRatio = unit.health / unit.stats.maxHealth;
  const isInFury = healthRatio <= haste.furyBelowFraction;
  return {
    damageMultiplier: isInFury ? 1 + haste.furyDamageBonus : 1,
    attackSpeedMultiplier: 1 + haste.maxAttackSpeedBonus * (1 - healthRatio),
  };
}

export interface AttackRoll {
  readonly rawDamage: number;
  readonly missed: boolean;
}

/** Ataque aleatório (Moço): sorteia um resultado e, dentro dele, o dano. Devolve null se o personagem ataca normalmente. */
export function rollRandomAttack(random: SeededRandom, unit: CombatUnit): AttackRoll | null {
  const behavior = findRegisteredBehavior(unit.ability, 'random_attack');
  if (!behavior) {
    return null;
  }
  const roll = random.next();
  let cumulativeChance = 0;
  const lastOutcome = behavior.outcomes[behavior.outcomes.length - 1]!;
  const outcome =
    behavior.outcomes.find((candidate) => {
      cumulativeChance += candidate.chance;
      return roll < cumulativeChance;
    }) ?? lastOutcome;

  const damageOnAttributeScale = outcome.minDamage + random.next() * (outcome.maxDamage - outcome.minDamage);
  const isMiss = outcome.maxDamage === 0;
  return { rawDamage: damageOnAttributeScale * 10 * unit.starMultiplier, missed: isMiss };
}
