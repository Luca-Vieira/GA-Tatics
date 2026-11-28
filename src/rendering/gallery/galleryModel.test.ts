import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { abilityTimingText, buildGalleryModel } from './galleryModel';
import { COMPARISON_SIZE, DEFAULT_FILTER, attributeValueOf, filterAndSortEntries, strongerSideOf, toggleComparisonChoice } from './galleryQuery';

const model = buildGalleryModel(DEFAULT_GAME_CONTENT);

function entryNamed(id: string) {
  const entry = model.characters.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Sem personagem ${id}`);
  }
  return entry;
}

describe('modelo da galeria', () => {
  it('mostra os personagens ativos com a sinergia vigente, e a torre à parte', () => {
    const activeCount = DEFAULT_GAME_CONTENT.characters.filter((character) => character.active).length;

    expect(model.characters).toHaveLength(activeCount);
    for (const entry of model.characters) {
      expect(entry.synergy?.id).toBe(DEFAULT_GAME_CONTENT.initialSynergyMapping[entry.id]);
      expect(entry.attack?.description).toContain('alcance');
      expect(entry.attributes).toHaveLength(5);
    }
    expect(model.characters.map((entry) => entry.id)).not.toContain('torre');
  });

  it('esconde personagens desativados e usa a distribuição recebida', () => {
    const [first, ...others] = DEFAULT_GAME_CONTENT.characters;
    const content = { ...DEFAULT_GAME_CONTENT, characters: [{ ...first!, active: false }, ...others] };
    const [synergy] = DEFAULT_GAME_CONTENT.synergies;
    const everyoneInFirst = Object.fromEntries(others.map((character) => [character.id, synergy!.id]));

    const changed = buildGalleryModel(content, everyoneInFirst);

    expect(changed.characters.map((entry) => entry.id)).not.toContain(first!.id);
    expect(new Set(changed.characters.map((entry) => entry.synergy?.id))).toEqual(new Set([synergy!.id]));
  });

  it('a torre não ataca, não tem sinergia e conta a renda e a compensação', () => {
    expect(model.towers[0]!.attack).toBeNull();
    expect(model.towers[0]!.synergy).toBeNull();
    expect(model.towers[0]!.attributes.map((attribute) => attribute.key)).toEqual(['health']);
    expect(model.towers[0]!.traits.map((trait) => trait.label)).toContain('Se for destruída');
  });

  it('liga o sprite auxiliar à torre e às invocações', () => {
    const sprite = { path: '/sprites/aux-aaaaaaaaaaaa.png', scale: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 1 };
    const changed = buildGalleryModel({ ...DEFAULT_GAME_CONTENT, auxiliarySprites: { torre: sprite, cavalo: sprite } });

    expect(changed.towers[0]!.sprite).toBe(sprite);
    expect(changed.characters.find((entry) => entry.id === 'gustavo')?.summons).toEqual([{ name: 'Cavalo', sprite }]);
  });

  it('descreve quando a habilidade é usada', () => {
    const [character] = DEFAULT_GAME_CONTENT.characters;
    const base = character!.ability;

    expect(abilityTimingText({ ...base, activation: { type: 'passive' } })).toBe('Passiva');
    expect(abilityTimingText({ ...base, activation: { type: 'health_threshold', belowFraction: 0.3 } })).toBe('Uma vez, com menos de 30% da vida');
    expect(abilityTimingText({ ...base, cooldownSeconds: 4.5, activation: { type: 'cooldown', requires: 'ally_fallen' } })).toBe(
      'Recarga de 4,5 s, depois que um aliado cai',
    );
  });
});

describe('filtro, ordenação e comparação', () => {
  it('filtra por sinergia', () => {
    const synergyId = model.synergies[0]!.id;
    const filtered = filterAndSortEntries(model.characters, { ...DEFAULT_FILTER, synergyId });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((entry) => entry.synergy?.id === synergyId)).toBe(true);
  });

  it('ordena por nome sem mexer na lista original', () => {
    const originalOrder = model.characters.map((entry) => entry.id);
    const names = filterAndSortEntries(model.characters, DEFAULT_FILTER).map((entry) => entry.name);

    expect(names).toEqual([...names].sort((first, second) => first.localeCompare(second, 'pt-BR')));
    expect(model.characters.map((entry) => entry.id)).toEqual(originalOrder);
  });

  it('ordena por atributo do maior para o menor', () => {
    const values = filterAndSortEntries(model.characters, { synergyId: null, sortKey: 'range' }).map((entry) => attributeValueOf(entry, 'range'));

    expect(values).toEqual([...values].sort((first, second) => second - first));
  });

  it('guarda no máximo dois para comparar e permite desmarcar', () => {
    expect(toggleComparisonChoice([], 'a')).toEqual(['a']);
    expect(toggleComparisonChoice(['a', 'b'], 'c')).toEqual(['b', 'c']);
    expect(toggleComparisonChoice(['a', 'b'], 'a')).toEqual(['b']);
    expect(COMPARISON_SIZE).toBe(2);
  });

  it('aponta quem tem o atributo maior', () => {
    const first = entryNamed('wilian');
    const second = entryNamed('helder');
    const expected = Math.sign(attributeValueOf(second, 'health') - attributeValueOf(first, 'health'));

    expect(strongerSideOf(first, first, 'health')).toBeNull();
    expect(strongerSideOf(first, second, 'health')).toBe(expected === 0 ? null : expected > 0 ? 1 : 0);
  });
});
