import type { SpriteSource } from '@core/game/MatchSession';
import { isTowerId } from '@core/tower/tower';

/** Os sprites auxiliares chegam em `SpriteSource.characterId` como `aux:<chave>` (veja `MatchSession.ts`). */
function auxiliarySpriteSourceId(key: string): string {
  return `aux:${key}`;
}

/** Como desenhar o sprite de um personagem (o que o painel de administração configura). */
export interface SpriteAppearance {
  readonly textureKey: string;
  /** Multiplica o tamanho padrão (a altura da imagem é ajustada à do boneco provisório). */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Ponto da imagem (0 a 1) que fica nos pés da unidade. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** A imagem é espelhada antes de tudo (arte enviada olhando para a esquerda). */
  readonly mirrored: boolean;
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
    mirrored: source.mirrored === true,
  };
}

/** Sob qual id procurar o sprite de uma unidade em combate: invocações, clones e torre usam os sprites auxiliares. */
export function spriteIdOfCombatUnit(unit: { readonly characterId: string | null; readonly auxiliarySpriteKey: string | null }): string | null {
  return unit.auxiliarySpriteKey === null ? unit.characterId : auxiliarySpriteSourceId(unit.auxiliarySpriteKey);
}

/** O mesmo para uma unidade do jogador (ou oferta da loja), em que a torre aparece como um "personagem". */
export function spriteIdOfCharacter(characterId: string): string {
  // A chave do sprite de uma torre é o id dela ("torre" ou "torre_...").
  return isTowerId(characterId) ? auxiliarySpriteSourceId(characterId) : characterId;
}
