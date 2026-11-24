import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { characterSchema } from '@data/schemas/character';
import { DEFAULT_SYNERGIES } from '@data/defaults/synergies';
import { synergySchema } from '@data/schemas/synergy';
import {
  ACTIVATION_FIELDS,
  ABILITY_FIELDS,
  BASIC_FIELDS,
  BEHAVIOR_FIELDS,
  CAST_FIELDS,
  EVOLUTION_FIELDS,
  STAT_FIELDS,
  effectFields,
  getAt,
  newActivation,
  newEffect,
  newRegisteredBehavior,
  newSynergyEffect,
  newSynergyTier,
  synergyEffectFields,
  SYNERGY_EFFECT_TYPE_OPTIONS,
  SYNERGY_FIELDS,
  parseFieldInput,
  setAt,
  type EffectType,
} from './fieldSpecs';

const bixo = () => JSON.parse(JSON.stringify(DEFAULT_CHARACTERS.find((character) => character.id === 'bixo'))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('leitura e escrita por caminho', () => {
  it('lê valores aninhados, incluindo listas, e devolve undefined quando não existe', () => {
    const draft = bixo();
    expect(getAt(draft, ['stats', 'health'])).toBe(10);
    expect(getAt(draft, ['ability', 'effects', 0, 'type'])).toBe('status');
    expect(getAt(draft, ['ability', 'nada', 'x'])).toBeUndefined();
    expect(getAt(draft, ['stats', 'health', 'x'])).toBeUndefined();
  });

  it('escreve numa cópia, sem alterar o original, criando níveis que faltam', () => {
    const draft = bixo();
    const changed = setAt(draft, ['stats', 'damage'], 9);
    expect(changed.stats.damage).toBe(9);
    expect(draft.stats.damage).toBe(4);
    const withNested = setAt(draft, ['evolution', 'starMultipliers', '2'], 3);
    expect(withNested.evolution.starMultipliers['2']).toBe(3);
    const withSprite = setAt({}, ['sprite', 'scale'], 1.5);
    expect(withSprite).toEqual({ sprite: { scale: 1.5 } });
  });

  it('valor undefined remove o campo, e em listas remove o item', () => {
    const draft = bixo();
    expect(setAt(draft, ['evolution'], undefined).evolution).toBeUndefined();
    const withoutFirstEffect = setAt(draft, ['ability', 'effects', 0], undefined);
    expect(withoutFirstEffect.ability.effects).toHaveLength(draft.ability.effects.length - 1);
  });
});

describe('campos do formulário', () => {
  it('todo campo fixo aponta para um valor que existe em todos os personagens padrão (ou é opcional)', () => {
    const fixed = [...BASIC_FIELDS, ...STAT_FIELDS, ...BEHAVIOR_FIELDS, ...ABILITY_FIELDS, ...CAST_FIELDS];
    for (const character of DEFAULT_CHARACTERS) {
      for (const field of fixed) {
        expect(getAt(character, field.path), `${character.id}: ${field.path.join('.')}`).not.toBeUndefined();
      }
    }
    expect(EVOLUTION_FIELDS.every((field) => field.optional)).toBe(true);
  });

  it('os campos de ativação batem com cada tipo usado pelos personagens', () => {
    for (const character of DEFAULT_CHARACTERS) {
      const type = character.ability.activation.type;
      for (const field of ACTIVATION_FIELDS[type] ?? []) {
        expect(getAt(character, field.path), `${character.id}: ${field.path.join('.')}`).not.toBeUndefined();
      }
    }
  });

  it('os campos de cada efeito dos personagens padrão apontam para valores existentes (ou opcionais)', () => {
    for (const character of DEFAULT_CHARACTERS) {
      character.ability.effects.forEach((effect, index) => {
        for (const field of effectFields(effect, ['ability', 'effects', index])) {
          const value = getAt(character, field.path);
          expect(value !== undefined || field.optional === true, `${character.id}: ${field.path.join('.')}`).toBe(true);
        }
      });
    }
  });
});

describe('modelos novos', () => {
  const types: EffectType[] = ['damage', 'heal', 'status', 'place_trap', 'summon_decoy', 'registered'];

  it.each(types)('um efeito novo do tipo %s é aceito pelo esquema e tem campos de formulário', (type) => {
    const draft = setAt(bixo(), ['ability', 'effects'], [newEffect(type)]);
    expect(characterSchema.safeParse(draft).success).toBe(true);
    expect(effectFields(newEffect(type), ['ability', 'effects', 0]).length).toBeGreaterThan(0);
  });

  it('trocar a ativação e o comportamento especial gera valores válidos', () => {
    for (const type of ['cooldown', 'health_threshold', 'first_hit_on_target', 'passive']) {
      const draft = setAt(bixo(), ['ability', 'activation'], newActivation(type));
      const withCooldown = setAt(draft, ['ability', 'cooldownSeconds'], 10);
      expect(characterSchema.safeParse(withCooldown).success, type).toBe(true);
    }
    for (const id of ['l_shaped_projectile', 'random_attack', 'missing_health_haste']) {
      const draft = setAt(bixo(), ['ability', 'effects'], [{ type: 'registered', behavior: newRegisteredBehavior(id) }]);
      expect(characterSchema.safeParse(draft).success, id).toBe(true);
    }
  });
});

describe('valores digitados', () => {
  const number = { path: ['x'], label: 'x', kind: 'number' as const };
  it('converte números (com vírgula), vazio e lixo', () => {
    expect(parseFieldInput(number, '2,5')).toBe(2.5);
    expect(parseFieldInput(number, ' 7 ')).toBe(7);
    expect(parseFieldInput(number, '')).toBeNull();
    expect(parseFieldInput({ ...number, optional: true }, '')).toBeUndefined();
    expect(parseFieldInput(number, 'abc')).toBeNull();
  });

  it('converte caixa de seleção e listas', () => {
    expect(parseFieldInput({ path: ['x'], label: 'x', kind: 'checkbox' }, true)).toBe(true);
    expect(parseFieldInput({ path: ['x'], label: 'x', kind: 'select', optional: true }, '')).toBeUndefined();
    expect(parseFieldInput({ path: ['x'], label: 'x', kind: 'select' }, 'rare')).toBe('rare');
    expect(parseFieldInput({ path: ['x'], label: 'x', kind: 'text' }, 'Olá')).toBe('Olá');
  });

  it('um número em branco num campo obrigatório é recusado pelo esquema do jogo', () => {
    const draft = setAt(bixo(), ['stats', 'health'], parseFieldInput(STAT_FIELDS[0]!, ''));
    expect(characterSchema.safeParse(draft).success).toBe(false);
  });
});

describe('campos de sinergia', () => {
  it('os campos fixos existem em todas as sinergias padrão e cada efeito padrão tem campos que apontam para valores reais', () => {
    for (const synergy of DEFAULT_SYNERGIES) {
      for (const field of SYNERGY_FIELDS) {
        expect(getAt(synergy, field.path), `${synergy.id}: ${field.path.join('.')}`).not.toBeUndefined();
      }
      synergy.tiers.forEach((tier, tierIndex) => {
        tier.effects.forEach((effect, effectIndex) => {
          for (const field of synergyEffectFields(effect, ['tiers', tierIndex, 'effects', effectIndex])) {
            expect(getAt(synergy, field.path), `${synergy.id}: ${field.path.join('.')}`).not.toBeUndefined();
          }
        });
      });
    }
  });

  it.each(SYNERGY_EFFECT_TYPE_OPTIONS.map((option) => option.value))('um efeito novo de sinergia do tipo %s é aceito pelo esquema e tem campos', (type) => {
    const effect = newSynergyEffect(type as Parameters<typeof newSynergyEffect>[0]);
    const synergy = { ...JSON.parse(JSON.stringify(DEFAULT_SYNERGIES[0])), tiers: [newSynergyTier(2), { threshold: 4, effects: [effect] }] };
    expect(synergySchema.safeParse(synergy).success).toBe(true);
    expect(synergyEffectFields(effect, ['tiers', 1, 'effects', 0]).length).toBeGreaterThan(0);
  });
});

