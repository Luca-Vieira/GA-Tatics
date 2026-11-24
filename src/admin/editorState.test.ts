import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { validateGameContent } from '@data/schemas/content';
import {
  addCharacterFrom,
  addSynergyFrom,
  applyCharacterText,
  applySectionText,
  characterText,
  contentIssues,
  hasChanges,
  importCharacters,
  importSynergies,
  removeCharacter,
  removeSynergy,
  sectionText,
  setCharacterActive,
  setCharacterSynergy,
  synergyCounts,
  uniqueCharacterId,
} from './editorState';

const base = DEFAULT_GAME_CONTENT;

describe('edição do conteúdo no painel', () => {
  it('o texto de cada parte volta igual quando aplicado sem mudanças', () => {
    for (const section of ['synergies', 'config', 'rotation'] as const) {
      const result = applySectionText(base, section, sectionText(base, section));
      expect(result.ok && result.content).toEqual(base);
    }
    const first = applyCharacterText(base, 0, characterText(base.characters[0]!));
    expect(first.ok && first.content).toEqual(base);
  });

  it('alterar a configuração pelo texto vale no conteúdo e não mexe no original', () => {
    const edited = JSON.parse(sectionText(base, 'config'));
    edited.tower.incomePerRound = 3;
    const result = applySectionText(base, 'config', JSON.stringify(edited));
    expect(result.ok && result.content.config.tower.incomePerRound).toBe(3);
    expect(base.config.tower.incomePerRound).toBe(2);
  });

  it('recusa JSON quebrado e dados inválidos, dizendo onde está o problema', () => {
    const broken = applySectionText(base, 'config', '{ não é json');
    expect(!broken.ok && broken.error).toContain('JSON inválido');

    const edited = JSON.parse(sectionText(base, 'config'));
    edited.tower.offerChancePercent = 500;
    const invalid = applySectionText(base, 'config', JSON.stringify(edited));
    expect(!invalid.ok && invalid.error).toContain('tower.offerChancePercent');

    const extraField = JSON.parse(characterText(base.characters[0]!));
    extraField.superPoder = true;
    expect(applyCharacterText(base, 0, JSON.stringify(extraField)).ok).toBe(false);
  });

  it('acrescenta uma cópia inativa com id livre e nome indicando a cópia', () => {
    const withCopy = addCharacterFrom(base, 0);
    expect(withCopy.characters).toHaveLength(base.characters.length + 1);
    const copy = withCopy.characters[withCopy.characters.length - 1]!;
    expect(copy).toMatchObject({ id: 'bixo_copia', name: 'Bixo (cópia)', active: false });
    const withTwo = addCharacterFrom(withCopy, 0);
    expect(withTwo.characters[withTwo.characters.length - 1]!.id).toBe('bixo_copia_2');
    expect(validateGameContent(withTwo).ok).toBe(true);
    expect(base.characters).toHaveLength(13);
  });

  it('gera ids livres', () => {
    expect(uniqueCharacterId('novo', ['a', 'b'])).toBe('novo');
    expect(uniqueCharacterId('novo', ['novo', 'novo_2'])).toBe('novo_3');
  });

  it('remover um personagem ativo tira ele das distribuições e deixa a sinergia com menos de 4 (o painel avisa)', () => {
    const without = removeCharacter(base, base.characters.findIndex((character) => character.id === 'bixo'));
    expect(without.initialSynergyMapping.bixo).toBeUndefined();
    expect(without.characters.some((character) => character.id === 'bixo')).toBe(false);
    expect(contentIssues(without).join('\n')).toContain('pelo menos 4');
    // O original não muda.
    expect(base.initialSynergyMapping.bixo).toBe('operacional');
  });

  it('o Derson está ativo em Caos (5 personagens); sem sinergia o painel aponta o problema, e desativado ele não precisa de uma', () => {
    const dersonIndex = base.characters.findIndex((character) => character.id === 'derson');
    expect(contentIssues(base)).toEqual([]);
    const { derson: _removed, ...mappingWithoutDerson } = base.initialSynergyMapping;
    void _removed;
    const withoutMapping = { ...base, initialSynergyMapping: mappingWithoutDerson };
    expect(contentIssues(withoutMapping).join('\n')).toContain('"derson" não tem sinergia');
    expect(contentIssues(setCharacterActive(withoutMapping, dersonIndex, false))).toEqual([]);
  });

  it('mostra se há diferenças em relação ao publicado', () => {
    expect(hasChanges(base, base)).toBe(false);
    expect(hasChanges(base, setCharacterActive(base, 0, false))).toBe(true);
  });
});

describe('importar personagens por texto JSON', () => {
  const derson = JSON.parse(characterText(base.characters.find((character) => character.id === 'derson')!));
  const novo = (id: string, extra: Record<string, unknown> = {}) => ({ ...structuredClone(derson), id, name: id.toUpperCase(), active: true, ...extra });
  const options = { asInactive: true, replaceExisting: false };

  it('aceita um personagem, uma lista e o envoltório { characters }', () => {
    for (const text of [JSON.stringify(novo('a1')), JSON.stringify([novo('a1'), novo('a2')]), JSON.stringify({ characters: [novo('a1'), novo('a2')] })]) {
      const result = importCharacters(base, text, options);
      expect(result.ok).toBe(true);
    }
    const list = importCharacters(base, JSON.stringify([novo('a1'), novo('a2')]), options);
    expect(list.ok && list.added).toEqual(['a1', 'a2']);
    expect(list.ok && list.content.characters).toHaveLength(base.characters.length + 2);
    expect(base.characters).toHaveLength(13);
  });

  it('entra inativo por padrão, ou como veio quando pedido', () => {
    const inactive = importCharacters(base, JSON.stringify(novo('a1')), options);
    expect(inactive.ok && inactive.content.characters.at(-1)?.active).toBe(false);
    const asGiven = importCharacters(base, JSON.stringify(novo('a1')), { ...options, asInactive: false });
    expect(asGiven.ok && asGiven.content.characters.at(-1)?.active).toBe(true);
    // Ativo sem sinergia: o painel mostra o problema ao validar o conteúdo.
    expect(asGiven.ok && contentIssues(asGiven.content).join('\n')).toContain('"a1" não tem sinergia');
  });

  it('é tudo ou nada: um personagem inválido impede a importação inteira e aponta qual', () => {
    const broken = novo('a2');
    broken.stats.health = 99;
    const result = importCharacters(base, JSON.stringify([novo('a1'), broken]), options);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join('\n')).toContain('Personagem 2: stats.health');
    expect(!result.ok && result.errors.join('\n')).not.toContain('Personagem 1');
  });

  it('recusa JSON quebrado, formato estranho, campos desconhecidos, id reservado e id repetido no texto', () => {
    expect(importCharacters(base, '{ não é json', options).ok).toBe(false);
    expect(importCharacters(base, '42', options).ok).toBe(false);
    expect(importCharacters(base, '[]', options).ok).toBe(false);
    expect(importCharacters(base, JSON.stringify(novo('a1', { poderExtra: 1 })), options).ok).toBe(false);
    const reserved = importCharacters(base, JSON.stringify(novo('torre')), options);
    expect(!reserved.ok && reserved.errors.join('\n')).toContain('reservado');
    const twice = importCharacters(base, JSON.stringify([novo('a1'), novo('a1')]), options);
    expect(!twice.ok && twice.errors.join('\n')).toContain('mais de uma vez');
  });

  it('id que já existe só é aceito com "substituir", e o personagem substituído mantém o sprite', () => {
    const clash = importCharacters(base, JSON.stringify(novo('bixo')), options);
    expect(!clash.ok && clash.errors.join('\n')).toContain('já existe');

    const withSprite = structuredClone(base);
    withSprite.characters[0] = { ...withSprite.characters[0]!, sprite: { path: '/sprites/bixo-0123456789ab.png', scale: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 1 } };
    const replaced = importCharacters(withSprite, JSON.stringify(novo('bixo')), { asInactive: false, replaceExisting: true });
    expect(replaced.ok && replaced.replaced).toEqual(['bixo']);
    expect(replaced.ok && replaced.content.characters[0]?.name).toBe('BIXO');
    expect(replaced.ok && replaced.content.characters[0]?.sprite?.path).toBe('/sprites/bixo-0123456789ab.png');
    expect(replaced.ok && replaced.content.characters).toHaveLength(13);
  });

  it('ignora o campo sprite do texto e avisa', () => {
    const result = importCharacters(base, JSON.stringify(novo('a1', { sprite: { path: 'https://evil.example.com/x.png' } })), options);
    expect(result.ok && result.notes.join('\n')).toContain('sprite');
    expect(result.ok && result.content.characters.at(-1)?.sprite).toBeUndefined();
  });

  it('limita o tamanho da importação', () => {
    const many = Array.from({ length: 51 }, (_, index) => novo(`p${index}`));
    expect(importCharacters(base, JSON.stringify(many), options).ok).toBe(false);
    expect(importCharacters(base, ' '.repeat(600_000), options).ok).toBe(false);
  });
});

describe('sinergias no painel', () => {
  const gestao = () => JSON.parse(JSON.stringify(base.synergies[1]));
  const novaSinergia = (id: string) => ({ ...gestao(), id, name: id.toUpperCase(), fullName: `${id} completa` });

  it('mostra quantos personagens ativos há em cada sinergia', () => {
    expect(synergyCounts(base).map((entry) => [entry.id, entry.count])).toEqual([
      ['operacional', 4],
      ['gestao', 4],
      ['caos', 5],
    ]);
    const moved = setCharacterSynergy(base, 'derson', 'gestao');
    expect(synergyCounts(moved).map((entry) => entry.count)).toEqual([4, 5, 4]);
    expect(base.initialSynergyMapping.derson).toBe('caos');
  });

  it('uma sinergia copiada nasce sem personagens (o painel aponta) e o limite é 5', () => {
    const added = addSynergyFrom(base, 0);
    expect(added.ok && added.content.synergies.map((synergy) => synergy.id)).toEqual(['operacional', 'gestao', 'caos', 'operacional_copia']);
    expect(added.ok && contentIssues(added.content).join(' ')).toContain('"operacional_copia" tem 0 personagem');
    const second = added.ok ? addSynergyFrom(added.content, 0) : added;
    const third = second.ok ? addSynergyFrom(second.content, 0) : second;
    expect(second.ok && second.content.synergies).toHaveLength(5);
    expect(!third.ok && third.error).toContain('no máximo 5');
    expect(base.synergies).toHaveLength(3);
  });

  it('remover uma sinergia manda os personagens dela para as que têm menos; com 3 não deixa remover', () => {
    expect(removeSynergy(base, 0)).toMatchObject({ ok: false });
    const added = addSynergyFrom(base, 0);
    if (!added.ok) throw new Error(added.error);
    const withMember = setCharacterSynergy(added.content, 'bixo', 'operacional_copia');
    const removed = removeSynergy(withMember, 3);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.content.synergies).toHaveLength(3);
    expect(['operacional', 'gestao']).toContain(removed.content.initialSynergyMapping.bixo);
    expect(Object.keys(removed.content.initialSynergyMapping)).toHaveLength(13);
    expect(contentIssues(removed.content)).toEqual([]);
  });

  it('importa sinergias por JSON: uma, lista ou envoltório; tudo ou nada; id repetido só com substituir', () => {
    const opts = { replaceExisting: false };
    const one = importSynergies(base, JSON.stringify(novaSinergia('trabalho')), opts);
    expect(one.ok && one.added).toEqual(['trabalho']);
    expect(one.ok && one.content.synergies).toHaveLength(4);
    expect(importSynergies(base, JSON.stringify({ synergies: [novaSinergia('a'), novaSinergia('b')] }), opts).ok).toBe(true);

    const broken = novaSinergia('ruim');
    broken.tiers[0].effects[0].value = -3;
    const failed = importSynergies(base, JSON.stringify([novaSinergia('boa'), broken]), opts);
    expect(!failed.ok && failed.errors.join(' ')).toContain('Sinergia 2');
    expect(!failed.ok && failed.errors.join(' ')).not.toContain('Sinergia 1');

    expect(importSynergies(base, '{ não é json', opts).ok).toBe(false);
    const clash = importSynergies(base, JSON.stringify(novaSinergia('gestao')), opts);
    expect(!clash.ok && clash.errors.join(' ')).toContain('já existe');
    const replaced = importSynergies(base, JSON.stringify({ ...novaSinergia('gestao'), name: 'Nova Gestão' }), { replaceExisting: true });
    expect(replaced.ok && replaced.content.synergies[1]?.name).toBe('Nova Gestão');
    expect(replaced.ok && replaced.content.synergies).toHaveLength(3);
  });

  it('não passa de 5 sinergias na importação', () => {
    const result = importSynergies(base, JSON.stringify([novaSinergia('a'), novaSinergia('b'), novaSinergia('c')]), { replaceExisting: false });
    expect(!result.ok && result.errors.join(' ')).toContain('no máximo 5');
  });
});

