import { describe, expect, it } from 'vitest';
import { auxiliarySpriteKeyOf, auxiliarySpriteSlotsOf } from './auxiliarySprites';
import { DEFAULT_GAME_CONTENT } from './defaults/content';
import { validateGameContent } from './schemas/content';

/** Só os campos que o teste apaga para imitar um arquivo antigo. */
interface OldContentShape {
  auxiliarySprites?: unknown;
  config: { tower: { compensationOnLoss?: number } };
  characters: { attack?: unknown; ability: { visual: { icon?: string; projectileIcon?: string } } }[];
}

describe('conteúdo salvo antes destas mudanças', () => {
  it('continua válido sem os campos novos, que recebem o valor padrão', () => {
    const old = structuredClone(DEFAULT_GAME_CONTENT) as unknown as OldContentShape;
    delete old.auxiliarySprites;
    delete old.config.tower.compensationOnLoss;
    for (const character of old.characters) {
      delete character.attack;
      delete character.ability.visual.icon;
      delete character.ability.visual.projectileIcon;
    }
    const result = validateGameContent(old);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.auxiliarySprites).toEqual({});
      expect(result.content.config.tower.compensationOnLoss).toBe(2);
    }
  });
});

describe('sprites auxiliares', () => {
  it('a chave vem do nome, sem acentos nem espaços', () => {
    expect(auxiliarySpriteKeyOf('Cavalo')).toBe('cavalo');
    expect(auxiliarySpriteKeyOf('  Pônei Mágico! ')).toBe('ponei_magico');
    expect(auxiliarySpriteKeyOf('???')).toBe('auxiliar');
  });

  it('o conteúdo de lançamento oferece a torre, o cavalo e o protagonista', () => {
    expect(auxiliarySpriteSlotsOf(DEFAULT_GAME_CONTENT.characters).map((slot) => slot.key).sort()).toEqual(['cavalo', 'protagonista', 'torre']);
  });

  it('só aceita sprite enviado pelo painel e chave bem formada', () => {
    const withSprite = (key: string, path: string) => validateGameContent({ ...DEFAULT_GAME_CONTENT, auxiliarySprites: { [key]: { path } } }).ok;
    expect(withSprite('cavalo', '/sprites/cavalo-0123456789ab.png')).toBe(true);
    expect(withSprite('cavalo', 'https://exemplo.com/cavalo.png')).toBe(false);
    expect(withSprite('Cavalo Bravo', '/sprites/cavalo-0123456789ab.png')).toBe(false);
  });

  it('o João Lucas dispara um "L"', () => {
    expect(DEFAULT_GAME_CONTENT.characters.find((character) => character.id === 'joao_lucas')?.ability.visual.projectileIcon).toBe('L');
  });
});
