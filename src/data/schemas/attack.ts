import { z } from 'zod';
import { ATTACK_SHAPES, describeAttackArea } from '@shared/utils/attackArea';

export const attackShapeSchema = z.enum(ATTACK_SHAPES);

/** Chance de o ataque básico envenenar o alvo. O dano de cada pulso é uma fração do dano do personagem. */
export const poisonOnHitSchema = z.strictObject({
  chance: z.number().gt(0).max(1),
  damageFraction: z.number().gt(0).max(2).default(0.2),
  tickSeconds: z.number().gt(0).default(1),
  durationSeconds: z.number().gt(0).default(3),
});
export type PoisonOnHit = z.infer<typeof poisonOnHitSchema>;

/** Como é o ataque básico do personagem. O comprimento da área é o alcance dos atributos. */
export const attackSchema = z.strictObject({
  shape: attackShapeSchema.default('circle'),
  /** Quantos inimigos dentro da área cada golpe acerta (o alvo conta como o primeiro). */
  maxTargets: z.number().int().min(1).max(6).default(1),
  /** Fração do dano que cada inimigo além do alvo recebe. */
  splashDamageFraction: z.number().min(0).max(1).default(0.5),
  poisonOnHit: poisonOnHitSchema.optional(),
});
export type AttackDefinition = z.infer<typeof attackSchema>;

/** Ataque de quem não define um: em todas as direções, um inimigo por golpe. */
export const DEFAULT_ATTACK: AttackDefinition = attackSchema.parse({});

export function attackOf(character: { readonly attack?: AttackDefinition }): AttackDefinition {
  return character.attack ?? DEFAULT_ATTACK;
}

/** Texto do ataque para as telas e o painel: o formato e, se houver, a chance de veneno. */
export function describeAttack(attack: AttackDefinition, range: number): string {
  const area = describeAttackArea(attack.shape, range, attack.maxTargets, attack.splashDamageFraction);
  const poison = attack.poisonOnHit;
  if (!poison) {
    return area;
  }
  return `${area} Cada golpe tem ${Math.round(poison.chance * 100)}% de chance de envenenar o alvo por ${poison.durationSeconds} s.`;
}
