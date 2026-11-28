/** Aba "Torres e minions": a torre básica, as torres personalizadas e as criaturas que as habilidades invocam. */
import type { GameContent } from '@data/schemas/content';
import { actionButton, el } from './dom';
import { effectFields, getAt, newSynergyEffect, setAt, summonFields, towerFields, towerRulesFields, TOWER_BUFF_RADIUS_FIELD, type FieldSpec, type PathStep } from './fieldSpecs';
import { MAXIMUM_TOWER_BUFFS, MAXIMUM_TOWER_VARIANTS, minionReferencesOf, newTowerVariant, type MinionReference } from './structuresDraft';

type Json = Record<string, unknown>;

/** O que a aba precisa do restante do painel. */
export interface StructuresViewContext {
  readonly content: GameContent;
  /** O rascunho em edição (veja `structuresDraftOf`). */
  readonly draft: () => Json;
  readonly renderFields: (specs: readonly FieldSpec[]) => HTMLElement;
  /** O mesmo editor de bônus das sinergias. */
  readonly renderBonusEditor: (effect: unknown, effectPath: readonly PathStep[], onRemove: () => void) => HTMLElement;
  readonly commitAndRender: (next: Json) => void;
}

const MINION_KIND_LABELS: Readonly<Record<MinionReference['kind'], string>> = {
  summon: 'invocação direta',
  place_trap: 'sai de uma armadilha',
  summon_decoy: 'clone provocador',
};

export function renderStructuresView(context: StructuresViewContext): HTMLElement {
  return el('div', { className: 'form' }, [renderTowers(context), renderMinions(context)]);
}

function renderTowers(context: StructuresViewContext): HTMLElement {
  const draft = context.draft();
  const variants = (getAt(draft, ['tower', 'variants']) as Json[] | undefined) ?? [];
  const container = el('div', {}, [
    el('h2', { text: 'Torres' }),
    el('div', {
      className: 'note',
      text: 'As torres ativas aparecem na loja. Os bônus valem para os lutadores do mesmo time e são calculados no começo do combate, pela posição de cada um no tabuleiro. A imagem de cada torre é enviada na aba "Sprites e ícones" (depois de criar uma torre nova).',
    }),
    el('div', { className: 'effect' }, [el('strong', { text: 'Regras da loja (valem para todas)' }), context.renderFields(towerRulesFields(['tower']))]),
    renderTowerBox(context, ['tower'], 'Torre básica', false),
    ...variants.map((variant, index) => renderTowerBox(context, ['tower', 'variants', index], String(variant.name ?? variant.id), true)),
  ]);

  if (variants.length < MAXIMUM_TOWER_VARIANTS) {
    container.append(
      el('div', { className: 'row' }, [
        actionButton('Nova torre', () => {
          const existing = variants.map((variant) => ({ id: String(variant.id), name: String(variant.name) }));
          context.commitAndRender(setAt(context.draft(), ['tower', 'variants', variants.length], newTowerVariant(existing)));
        }),
      ]),
    );
  }
  return container;
}

function renderTowerBox(context: StructuresViewContext, towerPath: readonly PathStep[], title: string, isVariant: boolean): HTMLElement {
  const tower = getAt(context.draft(), towerPath) as Json;
  const header = el('div', { className: 'row between' }, [el('strong', { text: title })]);
  if (isVariant) {
    header.append(
      actionButton(
        'Apagar torre',
        () => {
          if (window.confirm(`Apagar a torre "${title}"? A mudança só vale depois de publicar.`)) {
            context.commitAndRender(setAt(context.draft(), towerPath, undefined));
          }
        },
        'danger',
      ),
    );
  }
  const box = el('div', { className: 'effect' }, [header]);
  if (isVariant) {
    box.append(el('div', { className: 'muted', text: `Id: ${String(tower.id)}` }));
  }
  box.append(context.renderFields(towerFields(towerPath, isVariant)), renderBuffs(context, towerPath));
  return box;
}

function renderBuffs(context: StructuresViewContext, towerPath: readonly PathStep[]): HTMLElement {
  const buffs = (getAt(context.draft(), [...towerPath, 'buffs']) as Json[] | undefined) ?? [];
  const container = el('div', {}, [el('h3', { text: buffs.length === 0 ? 'Bônus: nenhum' : 'Bônus para os aliados' })]);
  buffs.forEach((buff, index) => {
    const buffPath = [...towerPath, 'buffs', index];
    const editor = context.renderBonusEditor(buff.effect, [...buffPath, 'effect'], () => context.commitAndRender(setAt(context.draft(), buffPath, undefined)));
    editor.append(context.renderFields([{ ...TOWER_BUFF_RADIUS_FIELD, path: [...buffPath, 'radius'] }]));
    container.append(editor);
  });
  if (buffs.length < MAXIMUM_TOWER_BUFFS) {
    container.append(
      el('div', { className: 'row' }, [
        actionButton(
          'Adicionar bônus',
          () => context.commitAndRender(setAt(context.draft(), [...towerPath, 'buffs'], [...buffs, { radius: 2, effect: newSynergyEffect('attribute_multiplier') }])),
          'quiet',
        ),
      ]),
    );
  }
  return container;
}

function renderMinions(context: StructuresViewContext): HTMLElement {
  const minions = minionReferencesOf(context.content.characters);
  const container = el('div', {}, [
    el('h2', { text: 'Minions (criaturas invocadas)' }),
    el('div', {
      className: 'note',
      text: 'Cada minion pertence à habilidade de um personagem; para criar um novo, adicione um efeito de invocação a um personagem na aba "Personagens". Mudar o nome troca a chave do sprite: reenvie a imagem.',
    }),
  ]);
  if (minions.length === 0) {
    container.append(el('div', { className: 'muted', text: 'Nenhuma habilidade do elenco invoca criaturas.' }));
    return container;
  }
  for (const minion of minions) {
    const effectPath = ['characters', minion.characterIndex, 'ability', 'effects', minion.effectIndex];
    const effect = getAt(context.draft(), effectPath);
    const specs = minion.kind === 'summon_decoy' ? effectFields(effect, effectPath) : summonFields(effectPath);
    container.append(
      el('div', { className: 'effect' }, [el('strong', { text: `${minion.name} — ${minion.characterName} (${MINION_KIND_LABELS[minion.kind]})` }), context.renderFields(specs)]),
    );
  }
  return container;
}
