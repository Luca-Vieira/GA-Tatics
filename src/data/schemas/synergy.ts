import { z } from 'zod';

/** Efeitos reutilizáveis das sinergias (GDD Seção 4.8). */
export const synergyEffectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('attribute_multiplier'), attribute: z.enum(['damage', 'attackSpeed']), value: z.number().positive() }),
  z.strictObject({ type: z.literal('resistance_bonus'), value: z.number().min(0).max(1) }),
  z.strictObject({ type: z.literal('hp_regen'), value: z.number().positive().max(1), tickSeconds: z.number().positive() }),
  z.strictObject({ type: z.literal('cooldown_reduction'), value: z.number().min(0).max(0.9) }),
  z.strictObject({ type: z.literal('positive_effect_amplification'), value: z.number().min(0) }),
]);
export type SynergyEffect = z.infer<typeof synergyEffectSchema>;

export const synergyTierSchema = z.strictObject({
  /** Quantidade de unidades da sinergia no tabuleiro que ativa o nível. */
  threshold: z.number().int().min(1),
  effects: z.array(synergyEffectSchema).min(1),
});

export const synergySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  fullName: z.string().min(1),
  /** Explicação curta mostrada ao consultar a sinergia. */
  description: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1),
  /** allTeam: o bônus vale para a equipe inteira; ownSynergy: só para unidades da própria sinergia. */
  appliesTo: z.enum(['allTeam', 'ownSynergy']).default('allTeam'),
  tiers: z.array(synergyTierSchema).min(1),
});
export type SynergyDefinition = z.infer<typeof synergySchema>;

export const synergyRotationConfigSchema = z.strictObject({
  intervalDays: z.number().positive(),
  /** Início da rotação 0 (data ISO em UTC). */
  anchor: z.string().datetime(),
  seedPrefix: z.string().min(1),
  /** Mapa fixado manualmente (personagem → sinergia); enquanto existir, substitui o sorteio. */
  override: z.record(z.string(), z.string()).nullable().default(null),
});
export type SynergyRotationConfig = z.infer<typeof synergyRotationConfigSchema>;

/**
 * Mínimo de personagens em cada sinergia: o nível 2 pede 4 unidades da sinergia no tabuleiro, então menos de 4
 * personagens tornariam esse nível impossível. As sinergias não precisam ter o mesmo número de personagens.
 */
export const MINIMUM_CHARACTERS_PER_SYNERGY = 4;

/** Confere que cada personagem tem uma sinergia conhecida e que toda sinergia tem ao menos o mínimo de personagens. */
export function validateSynergyMapping(mapping: Readonly<Record<string, string>>, synergies: readonly SynergyDefinition[]): void {
  const knownIds = new Set(synergies.map((synergy) => synergy.id));
  const counts = new Map<string, number>(synergies.map((synergy) => [synergy.id, 0]));
  for (const [characterId, synergyId] of Object.entries(mapping)) {
    if (!knownIds.has(synergyId)) {
      throw new Error(`O personagem ${characterId} aponta para a sinergia desconhecida "${synergyId}".`);
    }
    counts.set(synergyId, (counts.get(synergyId) ?? 0) + 1);
  }
  for (const synergy of synergies) {
    const count = counts.get(synergy.id) ?? 0;
    if (count < MINIMUM_CHARACTERS_PER_SYNERGY) {
      throw new Error(`A sinergia "${synergy.id}" tem ${count} personagem(ns); toda sinergia precisa de pelo menos ${MINIMUM_CHARACTERS_PER_SYNERGY}.`);
    }
  }
}
