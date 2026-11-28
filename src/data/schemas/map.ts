import { z } from 'zod';

/** Mapas: só a aparência do tabuleiro e do fundo. Não mudam nenhuma regra da partida. */

export const MAXIMUM_MAPS = 20;
/** Texturas que o próprio jogo desenha, sem arquivo de imagem. */
export const MAP_TEXTURES = ['sand', 'lava', 'grass', 'moon', 'waves', 'dots'] as const;
export type MapTexture = (typeof MAP_TEXTURES)[number];

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const mapBackgroundSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('color'), color }),
  z.strictObject({ type: z.literal('gradient'), from: color, to: color, direction: z.enum(['vertical', 'horizontal', 'radial']).default('vertical') }),
  /** `color` é o fundo e `detail`, os desenhos por cima (grãos, rachaduras, folhas...). */
  z.strictObject({ type: z.literal('texture'), texture: z.enum(MAP_TEXTURES), color, detail: color }),
  /** Imagem enviada pelo painel; `darken` a escurece para o jogo continuar legível por cima. */
  z.strictObject({
    type: z.literal('image'),
    path: z.string().regex(/^\/sprites\/[a-z0-9_]{1,40}-[0-9a-f]{12}\.png$/, 'A imagem precisa ser enviada pelo painel.'),
    darken: z.number().min(0).max(0.85).default(0.25),
  }),
]);
export type MapBackground = z.infer<typeof mapBackgroundSchema>;

export const mapTilesSchema = z.strictObject({
  /** Casas da metade da esquerda (a do seu time). */
  left: color,
  /** Casas da metade da direita (a do adversário). */
  right: color,
  /** Quanto o tom varia de casa para casa; 0 = todas iguais. */
  variation: z.number().min(0).max(0.35).default(0),
});
export type MapTiles = z.infer<typeof mapTilesSchema>;

export const mapSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]{1,30}$/, 'O id do mapa usa letras minúsculas, números e "_".'),
  name: z.string().min(1).max(30),
  /** Liberado para as partidas: pode ser escolhido pelo anfitrião e entra no sorteio. */
  active: z.boolean().default(true),
  background: mapBackgroundSchema,
  tiles: mapTilesSchema,
});
export type MapDefinition = z.infer<typeof mapSchema>;
