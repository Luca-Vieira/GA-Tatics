/** Aba "Sprites": enviar, ver, ajustar e remover sprites de personagens e auxiliares, e os ícones das habilidades. */
import type { SpriteDefinition } from '@data/schemas/character';
import type { GameContent } from '@data/schemas/content';
import { AdminRequestError } from './adminClient';
import { actionButton, el, field } from './dom';
import { setCharacterIcon, type IconField } from './editorState';
import {
  ADJUSTMENT_RANGES,
  ALIGNMENT_PRESET_LABELS,
  adjustmentOf,
  applyAlignment,
  dragAdjustment,
  SpriteAdjustmentSession,
  type AdjustmentRange,
  type AlignmentPreset,
  type SpriteAdjustment,
  type SpriteFacing,
} from './spriteAdjust';
import { checkSpriteBytes, spriteRequirementsNotice } from './spriteFile';
import { createSpritePreview, type SpritePreview } from './spritePreview';
import { spriteOfTarget, spriteTargetsOf, targetId, uploadIdOf, withTargetSprite, type SpriteTarget } from './spriteTargets';

/** O que a aba precisa do restante do painel. */
export interface SpritesViewContext {
  /** Conteúdo em edição (lido de novo a cada uso, porque muda a cada ajuste aplicado). */
  readonly content: () => GameContent;
  readonly serverUrl: string;
  readonly isBusy: boolean;
  readonly upload: (uploadId: string, png: Uint8Array) => Promise<string>;
  /** Grava no conteúdo em edição (só vale para os jogadores depois de publicar). */
  readonly apply: (content: GameContent, message: string) => void;
  /** Grava sem refazer a tela, para não tirar o foco de quem está digitando. */
  readonly applyQuietly: (content: GameContent) => void;
  readonly render: () => void;
  readonly refreshStatus: () => void;
}

interface Selection {
  readonly id: string;
  /** Sprite que estava no conteúdo quando o ajuste começou; se ele mudar por fora, o ajuste recomeça. */
  source: string;
  session: SpriteAdjustmentSession;
}

/** Valor de `Selection.source` quando o alvo ainda não tem imagem. */
const NO_SPRITE_SOURCE = 'null';

const view = {
  selectedId: '',
  selection: null as Selection | null,
  facing: 'right' as SpriteFacing,
  showReference: true,
};

export function selectSpriteTarget(target: Pick<SpriteTarget, 'kind' | 'key'>): void {
  view.selectedId = targetId(target);
}

/** Há um ajuste na prévia que ainda não foi aplicado ao conteúdo? (Sem imagem enviada não há o que aplicar.) */
export function hasPendingAdjustment(): boolean {
  const { selection } = view;
  return selection !== null && selection.source !== NO_SPRITE_SOURCE && selection.session.isDirty;
}

export function discardPendingAdjustment(): void {
  view.selection = null;
}

export function confirmLeavingAdjustment(): boolean {
  if (!hasPendingAdjustment()) return true;
  if (!window.confirm('Há um ajuste de sprite que não foi aplicado e ele será descartado. Continuar?')) return false;
  discardPendingAdjustment();
  return true;
}

function sessionFor(target: SpriteTarget, sprite: SpriteDefinition | undefined): SpriteAdjustmentSession {
  const id = targetId(target);
  const source = JSON.stringify(sprite ?? null);
  const selection = view.selection;
  if (selection && selection.id === id && selection.source === source) {
    return selection.session;
  }
  const session = new SpriteAdjustmentSession(adjustmentOf(sprite));
  view.selection = { id, source, session };
  return session;
}

export function renderSpritesView(context: SpritesViewContext): HTMLElement {
  const targets = spriteTargetsOf(context.content());
  const selected = targets.find((target) => targetId(target) === view.selectedId) ?? targets[0];
  if (!selected) {
    return el('div', { className: 'muted', text: 'Não há o que ajustar.' });
  }
  view.selectedId = targetId(selected);
  return el('div', {}, [
    el('div', {
      className: 'note',
      text: 'A arte deve ficar de perfil, olhando para a DIREITA (se olhar para a esquerda, use "Espelhar a imagem"). O jogo a espelha quando a unidade ataca para a esquerda. Os ajustes só chegam aos jogadores depois de aplicar e publicar.',
    }),
    el('div', { className: 'columns spaced' }, [renderTargetList(context, targets, selected), renderEditorFor(context, selected)]),
    renderIconTable(context),
  ]);
}

function renderTargetList(context: SpritesViewContext, targets: readonly SpriteTarget[], selected: SpriteTarget): HTMLElement {
  const list = el('div', { className: 'list' });
  let lastKind = '';
  for (const target of targets) {
    if (target.kind !== lastKind) {
      list.append(el('h3', { text: target.kind === 'character' ? 'Personagens' : 'Auxiliares (torre, invocações, clones)' }));
      lastKind = target.kind;
    }
    list.append(renderTargetRow(context, target, targetId(target) === targetId(selected)));
  }
  return list;
}

function renderTargetRow(context: SpritesViewContext, target: SpriteTarget, isSelected: boolean): HTMLElement {
  const sprite = spriteOfTarget(context.content(), target);
  const thumbnail = sprite
    ? el('img', { className: 'thumbnail', attributes: { src: `${context.serverUrl}${sprite.path}`, alt: '' } })
    : el('span', { className: 'thumbnail empty', text: '–' });
  const row = el('button', { className: `item${isSelected ? ' selected' : ''}`, type: 'button' }, [
    thumbnail,
    el('span', { className: 'name', text: target.label }),
    el('span', { className: 'muted', text: target.isUsed ? '' : 'sem uso' }),
  ]);
  row.addEventListener('click', () => {
    if (isSelected || !confirmLeavingAdjustment()) return;
    view.selectedId = targetId(target);
    context.render();
  });
  return row;
}

// --- Editor do sprite selecionado -------------------------------------------------------------------

interface AdjustmentPanel {
  readonly preview: SpritePreview;
  readonly repaint: () => void;
}

function renderEditorFor(context: SpritesViewContext, target: SpriteTarget): HTMLElement {
  const sprite = spriteOfTarget(context.content(), target);
  const session = sessionFor(target, sprite);
  const status = el('div', { className: 'error' });
  let chosenFileUrl: string | null = null;

  const syncers: ((adjustment: SpriteAdjustment) => void)[] = [];
  const pendingNote = el('div', { className: 'warn-text' });
  const applyButton = actionButton('Aplicar ajuste', () => applyAdjustment(context, target, session), 'good');
  const undoButton = actionButton('Desfazer', () => update(() => session.undo()), 'quiet');
  const discardButton = actionButton('Voltar ao aplicado', () => update(() => session.discard()), 'quiet');

  const preview = createSpritePreview(dragHandlers(target, session, () => panel.repaint()), () => {
    status.textContent = 'Não foi possível carregar a imagem deste sprite.';
  });
  const panel: AdjustmentPanel = {
    preview,
    repaint: () => {
      const storedUrl = sprite ? `${context.serverUrl}${sprite.path}` : null;
      preview.update({ url: chosenFileUrl ?? storedUrl, adjustment: session.current, bodyScale: target.bodyScale, facing: view.facing, showReference: view.showReference });
      syncers.forEach((sync) => sync(session.current));
      applyButton.disabled = context.isBusy || !sprite || !session.isDirty;
      undoButton.disabled = !session.canUndo;
      discardButton.disabled = !session.isDirty;
      pendingNote.textContent = session.isDirty && sprite ? 'Ajuste ainda não aplicado (aplique para poder publicar).' : '';
      context.refreshStatus();
    },
  };
  const update = (change: () => void) => {
    change();
    panel.repaint();
  };

  const fileSection = renderFileSection(context, target, sprite, status, (url) => {
    chosenFileUrl = url;
    panel.repaint();
  });
  const controls = el('div', { className: 'adjust-controls' }, ADJUSTMENT_RANGES.map((range) => renderAdjustmentControl(range, session, panel, syncers)));
  const presets = el(
    'div',
    { className: 'row' },
    (Object.keys(ALIGNMENT_PRESET_LABELS) as AlignmentPreset[]).map((preset) =>
      actionButton(ALIGNMENT_PRESET_LABELS[preset], () => update(() => session.change(applyAlignment(session.current, preset))), 'quiet'),
    ),
  );
  const history = el('div', { className: 'row' }, [applyButton, undoButton, discardButton, actionButton('Restaurar padrão', () => update(() => session.restoreDefault()), 'quiet')]);

  const mirrorButton = actionButton('', () => update(() => session.change({ ...session.current, mirrored: !session.current.mirrored })), 'quiet');
  syncers.push((adjustment) => {
    mirrorButton.textContent = adjustment.mirrored ? '⇋ Imagem espelhada (desfazer o espelho)' : '⇋ Espelhar a imagem';
    mirrorButton.disabled = !sprite && chosenFileUrl === null;
  });

  const stage = el('div', { className: 'stage-column' }, [renderViewOptions(panel), el('div', { className: 'row' }, [mirrorButton])]);
  stage.append(preview.element, el('div', { className: 'help', text: 'A cruz amarela são os pés (centro da casa). Dá para arrastar a imagem. No jogo, quem está no fundo do tabuleiro aparece até 10% menor.' }));

  const editor = el('div', { className: 'form' }, [
    el('h2', { text: target.label }),
    fileSection,
    status,
    el('div', { className: 'adjust-layout' }, [stage, el('div', {}, [controls, presets, history, pendingNote])]),
  ]);
  // A caixa de avisos do painel só existe depois que a tela inteira foi montada.
  queueMicrotask(panel.repaint);
  return editor;
}

function dragHandlers(target: SpriteTarget, session: SpriteAdjustmentSession, repaint: () => void) {
  let start = session.current;
  return {
    start: () => {
      start = session.current;
    },
    move: (deltaX: number, deltaY: number) => {
      session.preview(dragAdjustment(start, deltaX, deltaY, target.bodyScale, view.facing));
      repaint();
    },
    end: () => {
      session.record();
      repaint();
    },
  };
}

function renderViewOptions(panel: AdjustmentPanel): HTMLElement {
  const facingButton = actionButton('', () => {
    view.facing = view.facing === 'right' ? 'left' : 'right';
    paintLabel();
    panel.repaint();
  }, 'quiet');
  const paintLabel = () => {
    facingButton.textContent = view.facing === 'right' ? 'Olhando para a direita → ver à esquerda' : 'Olhando para a esquerda → ver à direita';
  };
  paintLabel();
  const reference = el('input', { type: 'checkbox' });
  reference.checked = view.showReference;
  reference.addEventListener('change', () => {
    view.showReference = reference.checked;
    panel.repaint();
  });
  return el('div', { className: 'row' }, [facingButton, el('label', { className: 'inline' }, [reference, 'Mostrar a cápsula de referência'])]);
}

function renderAdjustmentControl(
  range: AdjustmentRange,
  session: SpriteAdjustmentSession,
  panel: AdjustmentPanel,
  syncers: ((adjustment: SpriteAdjustment) => void)[],
): HTMLElement {
  const limits = { min: String(range.minimum), max: String(range.maximum), step: String(range.step) };
  const slider = el('input', { type: 'range', attributes: { ...limits, 'aria-label': range.label } });
  const number = el('input', { type: 'number', attributes: { step: String(range.step), 'aria-label': `${range.label} (número)` } });
  const show = (input: HTMLInputElement) => {
    const value = Number(input.value.replace(',', '.'));
    if (input.value.trim() === '' || !Number.isFinite(value)) return;
    session.preview({ ...session.current, [range.property]: value });
    panel.repaint();
  };
  for (const input of [slider, number]) {
    input.addEventListener('input', () => show(input));
    input.addEventListener('change', () => {
      show(input);
      session.record();
      panel.repaint();
    });
  }
  syncers.push((adjustment) => {
    slider.value = String(adjustment[range.property]);
    // Enquanto a pessoa digita, o campo não é reescrito.
    if (document.activeElement !== number) number.value = String(adjustment[range.property]);
  });
  return field(range.label, el('div', { className: 'slider-row' }, [slider, number]), range.help);
}

function applyAdjustment(context: SpritesViewContext, target: SpriteTarget, session: SpriteAdjustmentSession): void {
  const content = context.content();
  const sprite = spriteOfTarget(content, target);
  if (!sprite) return;
  const next = withTargetSprite(content, target, { path: sprite.path, ...session.current });
  session.markApplied();
  rememberSource(target, spriteOfTarget(next, target));
  context.apply(next, `Ajuste de ${target.label} aplicado (ainda não publicado).`);
}

/** Depois de aplicar, o histórico continua valendo para o mesmo sprite. */
function rememberSource(target: SpriteTarget, sprite: SpriteDefinition | undefined): void {
  if (view.selection?.id === targetId(target)) {
    view.selection.source = JSON.stringify(sprite ?? null);
  }
}

// --- Envio e remoção --------------------------------------------------------------------------------

function renderFileSection(
  context: SpritesViewContext,
  target: SpriteTarget,
  sprite: SpriteDefinition | undefined,
  status: HTMLElement,
  showChosenFile: (url: string | null) => void,
): HTMLElement {
  const fileInput = el('input', { type: 'file', attributes: { accept: 'image/png' } });
  let chosenUrl: string | null = null;
  fileInput.addEventListener('change', () => {
    if (chosenUrl) URL.revokeObjectURL(chosenUrl);
    const file = fileInput.files?.[0];
    chosenUrl = file ? URL.createObjectURL(file) : null;
    status.textContent = file ? 'Prévia do arquivo escolhido: ele ainda não foi enviado.' : '';
    showChosenFile(chosenUrl);
  });

  const actions = el('div', { className: 'row' }, [
    fileInput,
    actionButton(sprite ? 'Enviar e trocar' : 'Enviar sprite', () => void uploadSprite(context, target, fileInput, status), '', context.isBusy),
  ]);
  if (sprite) {
    actions.append(actionButton('Remover sprite', () => removeSprite(context, target), 'danger', context.isBusy));
  }
  const description = sprite ? `Arquivo: ${sprite.path}` : 'Sem sprite: o jogo usa o desenho provisório.';
  return el('div', {}, [spriteRequirementsNotice(), actions, el('div', { className: 'muted', text: description })]);
}

async function uploadSprite(context: SpritesViewContext, target: SpriteTarget, fileInput: HTMLInputElement, status: HTMLElement): Promise<void> {
  const file = fileInput.files?.[0];
  if (!file) {
    status.textContent = 'Escolha um arquivo PNG primeiro.';
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = checkSpriteBytes(bytes);
  if (problem) {
    status.textContent = problem;
    return;
  }
  status.textContent = 'Enviando…';
  try {
    const path = await context.upload(uploadIdOf(target), bytes);
    // O ajuste que está na prévia vale para a imagem nova.
    const adjustment = view.selection?.id === targetId(target) ? view.selection.session.current : adjustmentOf(spriteOfTarget(context.content(), target));
    discardPendingAdjustment();
    context.apply(withTargetSprite(context.content(), target, { path, ...adjustment }), `Sprite de ${target.label} enviado (ainda não publicado).`);
  } catch (failure) {
    status.textContent = failure instanceof AdminRequestError ? failure.message : 'Não foi possível enviar o sprite.';
  }
}

function removeSprite(context: SpritesViewContext, target: SpriteTarget): void {
  if (!window.confirm(`Remover o sprite de ${target.label}? Depois de publicar, o jogo volta ao desenho provisório.`)) return;
  discardPendingAdjustment();
  context.apply(withTargetSprite(context.content(), target, undefined), `Sprite de ${target.label} removido (ainda não publicado).`);
}

// --- Ícones ------------------------------------------------------------------------------------------

/** Todos os ícones de habilidade e de projétil num só lugar. */
function renderIconTable(context: SpritesViewContext): HTMLElement {
  const rows = context.content().characters.map((character, index) =>
    el('div', { className: 'icon-row' }, [
      el('span', { className: 'name', text: `${character.name} — ${character.ability.name}` }),
      renderIconInput(context, index, 'icon', 'Habilidade', character.ability.visual.icon),
      renderIconInput(context, index, 'projectileIcon', 'Projétil', character.ability.visual.projectileIcon),
    ]),
  );
  return el('details', { className: 'section' }, [
    el('summary', { text: 'Ícones de habilidades e projéteis' }),
    el('div', { className: 'note', text: 'Letra, número ou emoji (até 8 caracteres). O ícone do projétil é desenhado no lugar do disparo. Vazio = sem ícone.' }),
    ...rows,
  ]);
}

function renderIconInput(context: SpritesViewContext, index: number, iconField: IconField, label: string, value: string | undefined): HTMLElement {
  const input = el('input', { type: 'text', value: value ?? '', attributes: { maxlength: '8' } });
  const error = el('span', { className: 'warn-text' });
  input.addEventListener('change', () => {
    const result = setCharacterIcon(context.content(), index, iconField, input.value);
    error.textContent = result.ok ? '' : result.error;
    if (result.ok) context.applyQuietly(result.content);
  });
  return el('label', {}, [label, input, error]);
}
