import { describe, expect, it } from 'vitest';
import { effectSchema, statusKindSchema } from '@data/schemas/ability';
import { characterSchema } from '@data/schemas/character';
import { synergyEffectSchema, synergySchema } from '@data/schemas/synergy';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { validateGameContent } from '@data/schemas/content';
import { importCharacters, importSynergies } from './editorState';
import { buildReferenceGuide } from './referenceGuide';

const guide = buildReferenceGuide(DEFAULT_GAME_CONTENT, new Date('2026-11-24T12:00:00Z'));
const asText = JSON.stringify(guide);
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const loose = guide as Loose;

describe('referência exportável de personagens', () => {
  it('vira um arquivo JSON legível, com cabeçalho e data', () => {
    expect(JSON.parse(asText)).toEqual(guide);
    expect(loose.formato).toBe('merge-do-escritorio/referencia-de-conteudo');
    expect(loose.geradoEm).toBe('2026-11-24T12:00:00.000Z');
    expect(loose.comoCriarUmPersonagem.length).toBeGreaterThan(3);
  });

  it('traz o JSON Schema do esquema real do personagem, estrito e com os campos obrigatórios', () => {
    const schema = loose.personagem.jsonSchema;
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['id', 'name', 'stats', 'behavior', 'ability', 'rarity']));
    expect(schema.required).toEqual(expect.arrayContaining(['id', 'name', 'stats', 'ability']));
    expect(schema.properties.stats.properties.health).toMatchObject({ minimum: 1, maximum: 10 });
  });

  it('documenta todos os tipos de efeito e todos os estados que o esquema aceita', () => {
    const schemaEffectTypes = effectSchema.options.map((option) => option.shape.type.value).sort();
    expect(Object.keys(loose.habilidade.efeitos).sort()).toEqual(schemaEffectTypes);
    expect(Object.keys(loose.habilidade.estados).sort()).toEqual([...statusKindSchema.options].sort());
    expect(Object.keys(loose.habilidade.ativacao).sort()).toEqual(['cooldown', 'first_hit_on_target', 'health_threshold', 'passive']);
  });

  it('o exemplo de cada efeito e cada comportamento especial é aceito pelo esquema', () => {
    for (const [type, documented] of Object.entries(loose.habilidade.efeitos) as [string, Loose][]) {
      expect(effectSchema.safeParse(documented.exemplo).success, type).toBe(true);
    }
    for (const [id, documented] of Object.entries(loose.habilidade.comportamentosEspeciais) as [string, Loose][]) {
      expect(effectSchema.safeParse({ type: 'registered', behavior: documented.exemplo }).success, id).toBe(true);
    }
  });

  it('o modelo mínimo e os personagens de exemplo são válidos e podem ser importados', () => {
    expect(characterSchema.safeParse(loose.exemplos.modeloMinimo).success).toBe(true);
    expect(loose.exemplos.personagens.map((character: Loose) => character.id)).toEqual(['bixo', 'gustavo', 'derson', 'wender']);
    for (const character of loose.exemplos.personagens) {
      expect(characterSchema.safeParse(character).success, character.id).toBe(true);
    }
    const imported = importCharacters(DEFAULT_GAME_CONTENT, JSON.stringify(loose.exemplos.modeloMinimo), { asInactive: true, replaceExisting: false });
    expect(imported.ok && imported.added).toEqual(['meu_personagem']);
    expect(imported.ok && validateGameContent(imported.content).ok).toBe(true);
  });

  it('a tabela de atributos segue as fórmulas do jogo', () => {
    expect(loose.atributos.tabela['10'].vidaDeJogo).toBe(1500);
    expect(loose.atributos.tabela['1'].ataquesPorSegundo).toBe(0.55);
    expect(loose.atributos.multiplicadoresDeEstrela).toEqual({ 1: 1, 2: 2.5, 3: 6 });
  });

  it('lista as sinergias e os custos do conteúdo atual', () => {
    expect(loose.sinergias.atuais.map((synergy: Loose) => synergy.id)).toEqual(['operacional', 'gestao', 'caos']);
    expect(loose.sinergias.atuais.find((synergy: Loose) => synergy.id === 'caos').personagens).toContain('derson');
    expect(loose.raridadeECusto).toMatchObject({ common: 3, rare: 4, special: 5 });
  });

  it('os exemplos não levam sprite', () => {
    expect(JSON.stringify(loose.exemplos)).not.toContain('sprite');
  });
});

describe('referência de sinergias', () => {
  it('documenta todos os tipos de bônus do esquema, cada um com exemplo válido', () => {
    const schemaTypes = synergyEffectSchema.options.map((option) => option.shape.type.value).sort();
    expect(Object.keys(loose.sinergias.tiposDeBonus).sort()).toEqual(schemaTypes);
    for (const [type, documented] of Object.entries(loose.sinergias.tiposDeBonus) as [string, Loose][]) {
      expect(synergyEffectSchema.safeParse(documented.exemplo).success, type).toBe(true);
    }
    expect([...loose.sinergias.tiposDisponiveis].sort()).toEqual(schemaTypes);
  });

  it('traz o JSON Schema real da sinergia e exemplos válidos', () => {
    expect(loose.sinergias.jsonSchema.additionalProperties).toBe(false);
    expect(Object.keys(loose.sinergias.jsonSchema.properties)).toEqual(expect.arrayContaining(['id', 'name', 'color', 'tiers']));
    expect(synergySchema.safeParse(loose.sinergias.exemplos.modeloMinimo).success).toBe(true);
    expect(loose.sinergias.exemplos.sinergias).toHaveLength(3);
    for (const synergy of loose.sinergias.exemplos.sinergias) {
      expect(synergySchema.safeParse(synergy).success, synergy.id).toBe(true);
    }
  });

  it('o modelo mínimo pode ser importado e gera um conteúdo que só falta distribuir', () => {
    const imported = importSynergies(DEFAULT_GAME_CONTENT, JSON.stringify(loose.sinergias.exemplos.modeloMinimo), { replaceExisting: false });
    expect(imported.ok && imported.added).toEqual(['minha_sinergia']);
    expect(imported.ok && validateGameContent(imported.content).ok).toBe(false);
  });

  it('explica os limites: de 3 a 5 sinergias e ao menos 4 personagens em cada', () => {
    expect(loose.sinergias.limites.join(' ')).toContain('de 3 a 5');
    expect(loose.sinergias.limites.join(' ')).toContain('pelo menos 4');
  });
});

