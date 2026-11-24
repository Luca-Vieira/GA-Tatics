import { z } from 'zod';

const attributeScale = z.number().min(1).max(10);

/** Atributos na escala de 1 a 10 (GDD, Seção 3). */
export const baseStatsSchema = z.strictObject({
  health: attributeScale,
  damage: attributeScale,
  attackSpeed: attributeScale,
  range: z.number().int().min(1).max(10),
  mobility: attributeScale,
});
