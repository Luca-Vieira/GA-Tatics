/**
 * Sprites do que não é personagem: criaturas invocadas, clones e a torre. Cada um tem uma chave derivada do nome,
 * usada em `GameContent.auxiliarySprites` e em `CombatUnit.auxiliarySpriteKey`.
 */
import type { CharacterDefinition } from './schemas/character';

export const TOWER_SPRITE_KEY = 'torre';

/** "Cavalo" → "cavalo"; "Pônei Mágico" → "ponei_magico". */
export function auxiliarySpriteKeyOf(name: string): string {
  const withoutAccents = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const key = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return key.length > 0 ? key : 'auxiliar';
}

export interface AuxiliarySpriteSlot {
  readonly key: string;
  /** Nome para mostrar no painel. */
  readonly label: string;
}

/** Tudo o que pode receber um sprite auxiliar com o conteúdo atual: a torre e cada invocação ou clone do elenco. */
export function auxiliarySpriteSlotsOf(characters: readonly CharacterDefinition[]): AuxiliarySpriteSlot[] {
  const labelsByKey = new Map<string, string>([[TOWER_SPRITE_KEY, 'Torre']]);
  for (const character of characters) {
    for (const name of summonedNamesOf(character)) {
      labelsByKey.set(auxiliarySpriteKeyOf(name), name);
    }
  }
  return [...labelsByKey].map(([key, label]) => ({ key, label }));
}

function summonedNamesOf(character: CharacterDefinition): string[] {
  return character.ability.effects.flatMap((effect) => {
    if (effect.type === 'place_trap' || effect.type === 'summon') {
      return [effect.summon.name];
    }
    return effect.type === 'summon_decoy' ? [effect.name] : [];
  });
}
