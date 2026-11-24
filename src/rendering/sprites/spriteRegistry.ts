import type { SpriteSource } from '@core/game/MatchSession';

/** Como desenhar o sprite de um personagem (o que o painel de administração configura). */
export interface SpriteAppearance {
  readonly textureKey: string;
  /** Multiplica o tamanho padrão (a altura da imagem é ajustada à da cápsula provisória). */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Ponto da imagem (0 a 1) que fica nos pés da unidade. */
  readonly anchorX: number;
  readonly anchorY: number;
}

/** A chave da textura leva o endereço, que tem o hash do arquivo: uma imagem nova de um personagem vira outra textura. */
export function spriteTextureKey(url: string): string {
  return `sprite:${url}`;
}

export function appearanceOfSource(source: SpriteSource): SpriteAppearance {
  return {
    textureKey: spriteTextureKey(source.url),
    scale: source.scale,
    offsetX: source.offsetX,
    offsetY: source.offsetY,
    anchorX: source.anchorX,
    anchorY: source.anchorY,
  };
}
