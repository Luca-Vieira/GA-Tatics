import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { effectSchema } from '@data/schemas/ability';
import { characterSchema } from '@data/schemas/character';
import { validateGameContent } from '@data/schemas/content';
import { gameConfigSchema } from '@data/schemas/gameConfig';
import { importCharacters, setCharacterIcon } from './editorState';
import { ATTACK_FIELDS, BEHAVIOR_FIELDS, CAST_FIELDS, effectFields, EFFECT_TYPE_OPTIONS, getAt, newEffect, parseFieldInput, setAt } from './fieldSpecs';
import { buildReferenceGuide } from './referenceGuide';

const characterJson = (id: string) =>
  JSON.parse(JSON.stringify(DEFAULT_GAME_CONTENT.characters.find((character) => character.id === id))) as Record<string, unknown>;

describe('formulários com as novidades das regras', () => {
  it('a prioridade de alvo oferece o mais distante', () => {
    const priority = BEHAVIOR_FIELDS.find((spec) => spec.path.join('.') === 'behavior.targetPriority');
    expect(priority?.options?.map((option) => option.value)).toContain('farthest');
  });

  it('mudar um campo do ataque de quem não tem "attack" gera um personagem válido, com o restante no padrão', () => {
    const draft = characterJson('bixo');
    delete draft.attack;
    const shape = ATTACK_FIELDS[0]!;
    expect(getAt(draft, shape.path) ?? shape.fallback).toBe('circle');
    const parsed = characterSchema.parse(setAt(draft, shape.path, 'scythe'));
    expect(parsed.attack).toEqual({ shape: 'scythe', maxTargets: 1, splashDamageFraction: 0.5 });
  });

  it('a invocação direta tem modelo válido e campos que apontam para ele', () => {
    expect(EFFECT_TYPE_OPTIONS.map((option) => option.value)).toContain('summon');
    const effect = newEffect('summon');
    expect(effectSchema.safeParse(effect).success).toBe(true);
    for (const spec of effectFields(effect, [])) {
      expect(getAt(effect, spec.path), spec.path.join('.')).not.toBeUndefined();
    }
  });

  it('apagar o texto de um ícone remove o campo', () => {
    const icon = CAST_FIELDS.find((spec) => spec.path.join('.') === 'ability.visual.icon')!;
    expect(parseFieldInput(icon, '  ')).toBeUndefined();
    expect(parseFieldInput(icon, 'L')).toBe('L');
  });

  it('troca e remove ícones por personagem, recusando texto grande demais', () => {
    const index = DEFAULT_GAME_CONTENT.characters.findIndex((character) => character.id === 'joao_lucas');
    const changed = setCharacterIcon(DEFAULT_GAME_CONTENT, index, 'projectileIcon', 'J');
    expect(changed.ok && changed.content.characters[index]?.ability.visual.projectileIcon).toBe('J');
    const removed = setCharacterIcon(DEFAULT_GAME_CONTENT, index, 'projectileIcon', '');
    expect(removed.ok && removed.content.characters[index]?.ability.visual).not.toHaveProperty('projectileIcon');
    expect(setCharacterIcon(DEFAULT_GAME_CONTENT, index, 'icon', 'texto grande demais').ok).toBe(false);
    expect(DEFAULT_GAME_CONTENT.characters[index]?.ability.visual.projectileIcon).toBe('L');
  });

  it('importar por JSON aceita ataque, alvo mais distante, invocação direta e ícones', () => {
    const imported = {
      ...characterJson('gustavo'),
      id: 'importado',
      behavior: { movement: 'kite', targetPriority: 'farthest', preferredDistance: 3 },
      attack: { shape: 'dashed', maxTargets: 3, splashDamageFraction: 0.25 },
    };
    const result = importCharacters(DEFAULT_GAME_CONTENT, JSON.stringify(imported), { asInactive: true, replaceExisting: false });
    expect(result.ok && result.added).toEqual(['importado']);
    expect(result.ok && validateGameContent(result.content).ok).toBe(true);
  });

  it('a configuração sem a compensação da torre continua valendo, com 2 moedas', () => {
    const config = JSON.parse(JSON.stringify(DEFAULT_GAME_CONTENT.config));
    delete config.tower.compensationOnLoss;
    expect(gameConfigSchema.parse(config).tower.compensationOnLoss).toBe(2);
  });

  it('a referência explica o ataque, o alvo mais distante, os ícones e os sprites auxiliares, sem números antigos', () => {
    const guide = buildReferenceGuide(DEFAULT_GAME_CONTENT);
    const text = JSON.stringify(guide);
    for (const expected of ['ataqueBasico', 'splashDamageFraction', 'farthest', 'projectileIcon', 'spritesAuxiliares', 'uma única vez', '0,8 + 0,3 × mobilidade', '35 segundos', '12 casas de comprimento', '5 ofertas', '6 vagas']) {
      expect(text, expected).toContain(expected);
    }
    expect(text).not.toContain('0,5 + 0,25');
  });
});
