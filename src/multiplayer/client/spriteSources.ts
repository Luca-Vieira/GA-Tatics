import type { SpriteSource } from '@core/game/MatchSession';
import type { GameContent } from '@data/schemas/content';
import type { SpriteDefinition } from '@data/schemas/character';

function toSource(characterId: string, sprite: SpriteDefinition, spriteBaseUrl: string): SpriteSource {
  return {
    characterId,
    url: `${spriteBaseUrl}${sprite.path}`,
    scale: sprite.scale,
    offsetX: sprite.offsetX,
    offsetY: sprite.offsetY,
    anchorX: sprite.anchorX,
    anchorY: sprite.anchorY,
    mirrored: sprite.mirrored,
  };
}

/** Imagens que a tela da partida precisa baixar do servidor: as dos personagens e as auxiliares (torre, invocações, clones). */
export function spriteSourcesOf(content: Pick<GameContent, 'characters' | 'auxiliarySprites'>, spriteBaseUrl: string): SpriteSource[] {
  const characterSources = content.characters.flatMap((character) => (character.sprite ? [toSource(character.id, character.sprite, spriteBaseUrl)] : []));
  const auxiliarySources = Object.entries(content.auxiliarySprites).map(([key, sprite]) => ({ ...toSource(`aux:${key}`, sprite, spriteBaseUrl), auxiliaryKey: key }));
  return [...characterSources, ...auxiliarySources];
}
