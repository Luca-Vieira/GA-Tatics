import { z } from 'zod';
import { ATTACK_SHAPES } from '@shared/utils/attackArea';

export const attackShapeSchema = z.enum(ATTACK_SHAPES);

/** Como é o ataque básico do personagem. O comprimento da área é o alcance dos atributos. */
export const attackSchema = z.strictObject({
  shape: attackShapeSchema.default('circle'),
  /** Quantos inimigos dentro da área cada golpe acerta (o alvo conta como o primeiro). */
  maxTargets: z.number().int().min(1).max(6).default(1),
  /** Fração do dano que cada inimigo além do alvo recebe. */
  splashDamageFraction: z.number().min(0).max(1).default(0.5),
});
export type AttackDefinition = z.infer<typeof attackSchema>;

/** Ataque de quem não define um: em todas as direções, um inimigo por golpe. */
export const DEFAULT_ATTACK: AttackDefinition = attackSchema.parse({});

export function attackOf(character: { readonly attack?: AttackDefinition }): AttackDefinition {
  return character.attack ?? DEFAULT_ATTACK;
}
