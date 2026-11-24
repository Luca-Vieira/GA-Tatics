import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '../defaults/characters';
import { InMemoryCharacterRepository } from '../repositories/characterRepository';
import { characterSchema, parseRoster } from './character';

const bixoRaw = () => structuredClone(JSON.parse(JSON.stringify(DEFAULT_CHARACTERS.find((character) => character.id === 'bixo'))));

describe('elenco inicial', () => {
  it('tem os 12 personagens do GDD mais o Derson, todos ativos e com ids únicos', () => {
    expect(DEFAULT_CHARACTERS).toHaveLength(13);
    expect(new Set(DEFAULT_CHARACTERS.map((character) => character.id)).size).toBe(13);
    expect(DEFAULT_CHARACTERS.every((character) => character.active)).toBe(true);
    expect(DEFAULT_CHARACTERS.map((character) => character.id).sort()).toEqual(
      ['bixo', 'derson', 'felipao', 'gustavo', 'helder', 'joao_lucas', 'leo', 'marquinhos', 'matheus', 'moco', 'vinicius', 'wender', 'wilian'].sort(),
    );
  });

  it('segue as distribuições de raridade (7 comuns, 4 raros com o Derson, 2 especiais)', () => {
    const countOf = (rarity: string) => DEFAULT_CHARACTERS.filter((character) => character.active && character.rarity === rarity).length;
    expect(countOf('common')).toBe(7);
    expect(countOf('rare')).toBe(4);
    expect(countOf('special')).toBe(2);
  });

  it('mantém a identidade de cada extremo do GDD, mesmo depois do balanceamento (os números exatos mudam)', () => {
    const highest = (attribute: keyof (typeof DEFAULT_CHARACTERS)[number]['stats']) =>
      [...DEFAULT_CHARACTERS].sort((first, second) => second.stats[attribute] - first.stats[attribute])[0]!.id;
    expect(highest('mobility')).toBe('leo');
    expect(highest('attackSpeed')).toBe('leo');
    expect(highest('range')).toBe('joao_lucas');
    expect(highest('health')).toBe('bixo');
  });

  it('cada personagem tem exatamente uma habilidade com ao menos um efeito', () => {
    for (const character of DEFAULT_CHARACTERS) {
      expect(character.ability.effects.length).toBeGreaterThan(0);
    }
  });
});

describe('validação do esquema', () => {
  it('rejeita campos desconhecidos (erro de digitação no painel)', () => {
    const raw = bixoRaw();
    raw.stats.healht = 5;
    expect(characterSchema.safeParse(raw).success).toBe(false);
  });

  it('rejeita atributos fora da escala de 1 a 10', () => {
    const raw = bixoRaw();
    raw.stats.damage = 11;
    expect(characterSchema.safeParse(raw).success).toBe(false);
  });

  it('exige "value" nos estados que precisam de intensidade', () => {
    const raw = bixoRaw();
    delete raw.ability.effects[0].value;
    expect(characterSchema.safeParse(raw).success).toBe(false);
  });

  it('exige "tickSeconds" em estados periódicos', () => {
    const raw = JSON.parse(JSON.stringify(DEFAULT_CHARACTERS.find((character) => character.id === 'matheus')));
    delete raw.ability.effects[1].tickSeconds;
    expect(characterSchema.safeParse(raw).success).toBe(false);
  });

  it('rejeita um comportamento registrado inexistente (o painel não executa código arbitrário)', () => {
    const raw = JSON.parse(JSON.stringify(DEFAULT_CHARACTERS.find((character) => character.id === 'moco')));
    raw.ability.effects[0].behavior.id = 'run_arbitrary_code';
    expect(characterSchema.safeParse(raw).success).toBe(false);
  });

  it('rejeita habilidade ativa sem recarga', () => {
    const raw = bixoRaw();
    raw.ability.cooldownSeconds = 0;
    expect(characterSchema.safeParse(raw).success).toBe(false);
  });

  it('rejeita ids repetidos no elenco', () => {
    expect(() => parseRoster([bixoRaw(), bixoRaw()])).toThrow(/repetido/);
  });
});

describe('InMemoryCharacterRepository', () => {
  it('encontra por id e filtra os inativos', () => {
    const inactiveBixo = { ...bixoRaw(), active: false };
    const repository = new InMemoryCharacterRepository([inactiveBixo]);
    expect(repository.getById('bixo')?.name).toBe('Bixo');
    expect(repository.getById('naoexiste')).toBeUndefined();
    expect(repository.getActive()).toHaveLength(0);
    expect(repository.getAll()).toHaveLength(1);
  });

  it('sem argumentos, carrega o elenco inicial', () => {
    expect(new InMemoryCharacterRepository().getActive()).toHaveLength(13);
  });
});
