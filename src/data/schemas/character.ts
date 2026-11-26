import { z } from 'zod';
import { abilitySchema } from './ability';
import { attackSchema } from './attack';
import { baseStatsSchema } from './stats';

export const raritySchema = z.enum(['common', 'rare', 'special']);
export type Rarity = z.infer<typeof raritySchema>;

/** Perfis de comportamento do GDD (Seção 7.2) expressos como parâmetros, nunca como código. */
export const behaviorSchema = z.strictObject({
  /** chase: persegue; frontline: avança até a linha de frente; kite: mantém distância. */
  movement: z.enum(['chase', 'frontline', 'kite']),
  /**
   * Critério de escolha de alvo. "nearest" e "farthest" olham o campo todo; "lowest_health" e "cluster" olham os
   * inimigos próximos (alcance + 2) e, sem candidatos, escolhem o mais próximo.
   */
  targetPriority: z.enum(['nearest', 'farthest', 'lowest_health', 'cluster']),
  /** Distância mínima que o personagem tenta manter do inimigo mais próximo (recua se estiver mais perto). */
  preferredDistance: z.number().int().min(1).default(1),
});
export type BehaviorProfile = z.infer<typeof behaviorSchema>;

/** Imagem enviada pelo painel e como encaixá-la; serve para personagens e para os sprites auxiliares. */
export const spriteDefinitionSchema = z.strictObject({
  /** Caminho da imagem (PNG com transparência). Sem ele, o jogo usa o sprite provisório. */
  path: z.string().min(1),
  scale: z.number().positive().default(1),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  /** Ponto de ancoragem (0 a 1); os pés ficam em (0,5, 1). */
  anchorX: z.number().min(0).max(1).default(0.5),
  anchorY: z.number().min(0).max(1).default(1),
});
export type SpriteDefinition = z.infer<typeof spriteDefinitionSchema>;

const visualSchema = z.strictObject({
  idleAnimation: z.enum(['wiggle', 'bob']).default('wiggle'),
  walkAnimation: z.enum(['bounce']).default('bounce'),
  attackAnimation: z.enum(['lunge']).default('lunge'),
  hitAnimation: z.enum(['shake']).default('shake'),
});

const evolutionSchema = z.strictObject({
  /** Multiplicadores de vida e dano por estrela; sem eles valem os do GDD (2,5x e 6x). */
  starMultipliers: z.strictObject({ 2: z.number().positive(), 3: z.number().positive() }).optional(),
});

export const characterSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/, 'Use apenas letras minúsculas, números e "_".'),
  name: z.string().min(1),
  archetype: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  rarity: raritySchema,
  active: z.boolean().default(true),
  sprite: spriteDefinitionSchema.optional(),
  stats: baseStatsSchema,
  behavior: behaviorSchema,
  /** Formato do ataque básico; sem ele, ataca em círculo (um inimigo por golpe). */
  attack: attackSchema.optional(),
  ability: abilitySchema,
  visual: visualSchema.default({ idleAnimation: 'wiggle', walkAnimation: 'bounce', attackAnimation: 'lunge', hitAnimation: 'shake' }),
  evolution: evolutionSchema.default({}),
});
export type CharacterDefinition = z.infer<typeof characterSchema>;

/** Valida um elenco: cada personagem segue o esquema e os ids são únicos. */
export function parseRoster(rawCharacters: readonly unknown[]): CharacterDefinition[] {
  const characters = rawCharacters.map((raw) => characterSchema.parse(raw));
  const seenIds = new Set<string>();
  for (const character of characters) {
    if (seenIds.has(character.id)) {
      throw new Error(`Id de personagem repetido: ${character.id}`);
    }
    seenIds.add(character.id);
  }
  return characters;
}
