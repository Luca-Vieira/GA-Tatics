import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { validateGameContent } from '@data/schemas/content';
import { effectFields, getAt, setAt, summonFields, towerFields, towerRulesFields } from './fieldSpecs';
import { applyStructuresDraft, minionReferencesOf, newTowerVariant, structuresDraftOf } from './structuresDraft';

const content = DEFAULT_GAME_CONTENT;

describe('aba Torres e minions', () => {
  it('o rascunho sem mudanças volta igual ao conteúdo', () => {
    const result = applyStructuresDraft(content, structuresDraftOf(content));
    expect(result).toEqual({ ok: true, content });
  });

  it('uma torre nova nasce válida, desligada e sem repetir id ou nome', () => {
    const variants = [...content.config.tower.variants, { id: 'torre_nova_1', name: 'Torre nova 2' }];
    const created = newTowerVariant(variants);
    expect(created).toMatchObject({ id: 'torre_nova_3', name: 'Torre nova 3', active: false });
    const draft = setAt(structuresDraftOf(content), ['tower', 'variants', content.config.tower.variants.length], created);
    const result = applyStructuresDraft(content, draft);
    expect(result.ok && validateGameContent(result.content).ok).toBe(true);
  });

  it('um valor inválido não entra no conteúdo e é explicado', () => {
    const result = applyStructuresDraft(content, setAt(structuresDraftOf(content), ['tower', 'cost'], 0));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.join(' ')).toContain('tower.cost');
  });

  it('lista os minions de todas as habilidades, e editar um muda o personagem dono', () => {
    const minions = minionReferencesOf(content.characters);
    expect(minions.map((minion) => minion.name).sort()).toEqual(['Cavalo', 'Protagonista']);
    const horse = minions.find((minion) => minion.name === 'Cavalo')!;
    const path = ['characters', horse.characterIndex, 'ability', 'effects', horse.effectIndex, 'summon', 'stats', 'damage'];
    const result = applyStructuresDraft(content, setAt(structuresDraftOf(content), path, 7));
    expect(result.ok && getAt(result.content, path)).toBe(7);
  });

  it('todo campo das torres e dos minions aponta para um lugar do rascunho', () => {
    const draft = structuresDraftOf(content);
    const specs = [
      ...towerRulesFields(['tower']),
      ...towerFields(['tower', 'variants', 0], true),
      ...minionReferencesOf(content.characters).flatMap((minion) => {
        const effectPath = ['characters', minion.characterIndex, 'ability', 'effects', minion.effectIndex];
        return minion.kind === 'summon_decoy' ? effectFields(getAt(draft, effectPath), effectPath) : summonFields(effectPath);
      }),
    ];
    for (const spec of specs.filter((candidate) => !candidate.optional)) {
      expect(getAt(draft, spec.path), spec.path.join('.')).toBeDefined();
    }
  });
});
