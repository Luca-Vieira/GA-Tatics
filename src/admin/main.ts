import { characterSchema } from '@data/schemas/character';
import type { GameContent } from '@data/schemas/content';
import { synergySchema } from '@data/schemas/synergy';
import { defaultHttpAddress } from '@shared/utils/serverAddress';
import { renderActivitiesView } from './activitiesView';
import { AdminClient, AdminRequestError } from './adminClient';
import { createAttackPreview, type AttackPreview } from './attackPreview';
import { actionButton, el, field } from './dom';
import {
  addCharacterFrom,
  addSynergyFrom,
  applySectionText,
  cloneContent,
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
  type TextSection,
} from './editorState';
import {
  ABILITY_FIELDS,
  ATTACK_FIELDS,
  ACTIVATION_FIELDS,
  ACTIVATION_TYPE_OPTIONS,
  BASIC_FIELDS,
  BEHAVIOR_FIELDS,
  CAST_FIELDS,
  EFFECT_TYPE_OPTIONS,
  EVOLUTION_FIELDS,
  SPRITE_FIELDS,
  STAT_FIELDS,
  SYNERGY_EFFECT_TYPE_OPTIONS,
  SYNERGY_FIELDS,
  effectFields,
  getAt,
  newActivation,
  newEffect,
  newRegisteredBehavior,
  newSynergyEffect,
  newSynergyTier,
  parseFieldInput,
  setAt,
  synergyEffectFields,
  type EffectType,
  type FieldSpec,
  type SynergyEffectType,
} from './fieldSpecs';
import { buildReferenceGuide } from './referenceGuide';
import { DEFAULT_SPRITE_ADJUSTMENT } from './spriteAdjust';
import { checkSpriteBytes } from './spriteFile';
import { confirmLeavingAdjustment, discardPendingAdjustment, hasPendingAdjustment, renderSpritesView, selectSpriteTarget, type SpritesViewContext } from './spritesView';

type Tab = 'characters' | TextSection | 'sprites' | 'activities';
type Draft = Record<string, unknown>;

const TAB_LABELS: Readonly<Record<Tab, string>> = {
  characters: 'Personagens',
  sprites: 'Sprites e ícones',
  synergies: 'Sinergias',
  config: 'Configuração',
  rotation: 'Rotação e distribuição',
  activities: 'Em andamento',
};

function isTextSection(tab: Tab): tab is TextSection {
  return tab === 'synergies' || tab === 'config' || tab === 'rotation';
}

const SECTION_HELP: Readonly<Record<TextSection, string>> = {
  synergies: 'Exatamente 3 sinergias. Mude textos, cores e bônus dos níveis; os ids precisam bater com a distribuição.',
  config: 'Economia, loja (offerSize = quantas ofertas), rodadas (benchSize = vagas da reserva) e a torre (custo, vida, renda por rodada, chance de aparecer em cada vaga, máximo por jogador e compensationOnLoss = moedas pagas uma vez a quem perde uma torre).',
  rotation: 'Regra da rotação (intervalo, âncora, "override" para fixar uma distribuição) e a distribuição de lançamento (personagem → sinergia). Cada sinergia precisa de pelo menos 4 personagens ativos (não precisam ser quantidades iguais).',
};

interface State {
  client: AdminClient | null;
  serverUrl: string;
  published: GameContent | null;
  working: GameContent | null;
  version: number;
  tab: Tab;
  selectedCharacter: number;
  selectedSynergy: number;
  /** Personagem selecionado, como o formulário o está editando (pode estar inválido por um momento). */
  formDraft: Draft | null;
  /** Problemas do rascunho do personagem; enquanto houver, ele não vai para o conteúdo e não dá para publicar. */
  draftIssues: readonly string[];
  /** Texto do editor das abas em JSON. */
  draft: string;
  draftError: string;
  message: { kind: 'ok' | 'error'; text: string } | null;
  publishIssues: readonly string[];
  isBusy: boolean;
}

const state: State = {
  client: null,
  serverUrl: defaultHttpAddress({ isDevelopment: import.meta.env.DEV, page: window.location, configuredUrl: import.meta.env.VITE_SERVER_URL }),
  published: null,
  working: null,
  version: 0,
  tab: 'characters',
  selectedCharacter: 0,
  selectedSynergy: 0,
  formDraft: null,
  draftIssues: [],
  draft: '',
  draftError: '',
  message: null,
  publishIssues: [],
  isBusy: false,
};

const app = document.getElementById('app') as HTMLElement;

/** Partes da tela que mudam sem refazer tudo (refazer tiraria o foco do campo que a pessoa está digitando). */
let statusBox: HTMLElement | null = null;
let publishButton: HTMLButtonElement | null = null;
let versionLine: HTMLElement | null = null;

function button(label: string, onClick: () => void, className = '', disabled = false): HTMLButtonElement {
  return actionButton(label, onClick, className, disabled || state.isBusy);
}

/** Desenho da área de ataque do formulário aberto; é atualizado sem refazer a tela. */
let attackPreview: AttackPreview | null = null;

function render(): void {
  statusBox = null;
  publishButton = null;
  versionLine = null;
  attackPreview = null;
  app.replaceChildren(state.client && state.working ? renderEditor() : renderLogin());
}

// --- Entrada ------------------------------------------------------------------------------------

function renderLogin(): HTMLElement {
  const server = el('input', { value: state.serverUrl, type: 'text' });
  const username = el('input', { type: 'text' });
  const password = el('input', { type: 'password' });
  username.autocomplete = 'username';
  password.autocomplete = 'current-password';
  const error = el('div', { className: 'error', text: state.message?.kind === 'error' ? state.message.text : '' });

  const submit = async () => {
    state.serverUrl = server.value.trim().replace(/\/+$/, '');
    state.isBusy = true;
    state.message = null;
    render();
    try {
      const client = new AdminClient(state.serverUrl);
      await client.login(username.value, password.value);
      state.client = client;
      await reloadFromServer();
    } catch (failure) {
      state.client = null;
      state.message = { kind: 'error', text: failure instanceof AdminRequestError ? failure.message : 'Não foi possível entrar.' };
    }
    state.isBusy = false;
    render();
  };
  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void submit();
  });

  return el('div', { className: 'panel login' }, [
    el('h1', { text: 'Administração' }),
    el('div', { className: 'muted', text: 'Merge do Escritório — conteúdo do jogo' }),
    field('Endereço do servidor (HTTP)', server),
    field('Usuário', username),
    field('Senha', password),
    button('Entrar', () => void submit(), 'good'),
    error,
    el('div', { className: 'note', text: 'O usuário e a senha são definidos no servidor (ADMIN_USERNAME e ADMIN_PASSWORD). Não há cadastro. A conexão não é criptografada: use só em rede de confiança.' }),
  ]);
}

async function reloadFromServer(): Promise<void> {
  if (!state.client) return;
  const published = await state.client.fetchContent();
  state.published = published.content;
  state.working = cloneContent(published.content);
  state.version = published.version;
  state.selectedCharacter = 0;
  state.selectedSynergy = 0;
  state.publishIssues = [];
  discardPendingAdjustment();
  loadDraft();
}

/** Põe no editor o personagem ou a sinergia selecionada (formulário) ou o texto da aba atual. */
function loadDraft(): void {
  const working = state.working;
  if (!working) return;
  state.draftError = '';
  state.draftIssues = [];
  if (state.tab === 'characters') {
    const character = working.characters[state.selectedCharacter];
    state.formDraft = character ? (structuredClone(character) as Draft) : null;
  } else if (state.tab === 'synergies') {
    const synergy = working.synergies[state.selectedSynergy];
    state.formDraft = synergy ? (structuredClone(synergy) as Draft) : null;
  } else {
    state.formDraft = null;
    state.draft = isTextSection(state.tab) ? sectionText(working, state.tab) : '';
  }
}

/** Troca de personagem ou de aba: se o rascunho tem erros, avisa que eles serão descartados. */
function confirmLeavingDraft(): boolean {
  if (!confirmLeavingAdjustment()) return false;
  return state.draftIssues.length === 0 || window.confirm('O item em edição tem erros e eles serão descartados. Continuar?');
}

// --- Editor -------------------------------------------------------------------------------------

function canPublish(): boolean {
  const working = state.working;
  const published = state.published;
  const hasUnfinishedEdit = state.draftIssues.length > 0 || hasPendingAdjustment();
  return !!working && !!published && hasChanges(published, working) && contentIssues(working).length === 0 && !hasUnfinishedEdit;
}

function renderEditor(): HTMLElement {
  const working = state.working as GameContent;

  versionLine = el('div', { className: 'muted' });
  publishButton = button('Publicar alterações', () => void publish(), 'good', true);
  const header = el('div', { className: 'bar' }, [
    el('div', {}, [el('h1', { text: 'Administração' }), versionLine]),
    el('div', { className: 'row' }, [publishButton, button('Descartar e recarregar', () => void discard(), 'quiet'), button('Sair', () => void signOut(), 'quiet')]),
  ]);

  const tabs = el('div', { className: 'tabs' });
  (Object.keys(TAB_LABELS) as Tab[]).forEach((tab) => {
    tabs.append(
      button(
        TAB_LABELS[tab],
        () => {
          if (!confirmLeavingDraft()) return;
          state.tab = tab;
          state.message = null;
          loadDraft();
          render();
        },
        tab === state.tab ? 'active' : '',
      ),
    );
  });

  const body = renderTabBody(working);
  statusBox = el('div');
  refreshStatus();
  return el('div', {}, [header, el('div', { className: 'panel' }, [tabs, body]), statusBox]);
}

function renderTabBody(working: GameContent): HTMLElement {
  switch (state.tab) {
    case 'characters':
      return renderCharacters(working);
    case 'sprites':
      return renderSpritesView(spritesContext());
    case 'synergies':
      return renderSynergies(working);
    case 'activities':
      return renderActivities();
    default:
      return renderSection(state.tab);
  }
}

function spritesContext(): SpritesViewContext {
  return {
    content: () => state.working as GameContent,
    serverUrl: state.serverUrl,
    isBusy: state.isBusy,
    upload: async (uploadId, png) => {
      if (!state.client) throw new AdminRequestError('A sessão expirou. Entre de novo.', 'unauthorized');
      return state.client.uploadSprite(uploadId, png);
    },
    apply: (content, message) => {
      state.working = content;
      state.message = { kind: 'ok', text: message };
      render();
    },
    applyQuietly: (content) => {
      state.working = content;
      state.message = null;
      refreshStatus();
    },
    render,
    refreshStatus,
  };
}

function renderActivities(): HTMLElement {
  return renderActivitiesView({
    client: state.client as AdminClient,
    onSessionExpired: (message) => {
      state.client = null;
      state.message = { kind: 'error', text: message };
      render();
    },
  });
}

/** Atualiza só o botão de publicar e a caixa de avisos (sem refazer os campos). */
function refreshStatus(): void {
  const working = state.working;
  const published = state.published;
  if (!working || !published) return;
  const changed = hasChanges(published, working);
  const issues = contentIssues(working);
  if (versionLine) {
    versionLine.textContent = `Versão publicada: ${state.version}${changed ? ' · há alterações não publicadas' : ''}`;
  }
  if (publishButton) {
    publishButton.disabled = state.isBusy || !canPublish();
  }
  if (!statusBox) return;
  const children: HTMLElement[] = [];
  if (state.message) {
    children.push(el('div', { className: state.message.kind === 'ok' ? 'ok' : 'error', text: state.message.text }));
  }
  if (state.publishIssues.length > 0) {
    children.push(el('div', { className: 'issues', text: `O servidor recusou:\n${state.publishIssues.join('\n')}` }));
  }
  if (hasPendingAdjustment()) {
    children.push(el('div', { className: 'issues', text: 'Há um ajuste de sprite que não foi aplicado. Use "Aplicar ajuste" ou "Voltar ao aplicado" para poder publicar.' }));
  }
  if (state.draftIssues.length > 0) {
    children.push(el('div', { className: 'issues', text: `Este personagem tem erros (as alterações dele ainda não valem):\n${state.draftIssues.join('\n')}` }));
  }
  children.push(
    issues.length > 0
      ? el('div', { className: 'issues', text: `Problemas no conteúdo (corrija antes de publicar):\n${issues.join('\n')}` })
      : el('div', { className: 'good-box', text: 'O conteúdo está válido e pode ser publicado.' }),
    el('div', {
      className: 'note',
      text: 'Ao publicar, quem está conectado recebe um aviso para recarregar a página. Partidas em andamento terminam com o conteúdo antigo; as novas usam o novo. Sprites enviados só aparecem para os jogadores depois de publicar. Mudanças de balanceamento devem ser medidas (npm test e npm run sim) antes de publicar.',
    }),
  );
  statusBox.replaceChildren(...children);
}

// --- Personagens (formulário) ----------------------------------------------------------------------

function renderCharacters(working: GameContent): HTMLElement {
  const list = el('div', { className: 'list' });
  working.characters.forEach((character, index) => {
    const active = el('input', { type: 'checkbox' });
    active.checked = character.active;
    active.title = 'Ativo (aparece na loja)';
    active.addEventListener('click', (event) => event.stopPropagation());
    active.addEventListener('change', () => {
      state.working = setCharacterActive(working, index, active.checked);
      if (index === state.selectedCharacter) loadDraft();
      render();
    });
    const row = el('div', { className: `item${index === state.selectedCharacter ? ' selected' : ''}${character.active ? '' : ' inactive'}` }, [
      active,
      el('span', { className: 'name', text: character.name }),
      el('span', { className: 'muted', text: character.sprite ? 'sprite' : '' }),
      el('span', { className: 'muted', text: character.active ? '' : 'inativo' }),
    ]);
    row.addEventListener('click', () => {
      if (index !== state.selectedCharacter && !confirmLeavingDraft()) return;
      state.selectedCharacter = index;
      state.message = null;
      loadDraft();
      render();
    });
    list.append(row);
  });

  const actions = el('div', { className: 'row' }, [
    button('Novo (cópia deste)', () => {
      if (!confirmLeavingDraft()) return;
      state.working = addCharacterFrom(working, state.selectedCharacter);
      state.selectedCharacter = (state.working?.characters.length ?? 1) - 1;
      loadDraft();
      render();
    }),
    button(
      'Remover',
      () => {
        const target = working.characters[state.selectedCharacter];
        if (target && window.confirm(`Remover ${target.name}? Ele também sai das distribuições de sinergia.`)) {
          state.working = removeCharacter(working, state.selectedCharacter);
          state.selectedCharacter = Math.max(0, state.selectedCharacter - 1);
          loadDraft();
          render();
        }
      },
      'danger',
    ),
  ]);

  const left = el('div', {}, [
    list,
    el('div', { className: 'note', text: 'A caixa liga ou desliga o personagem na loja. Cada sinergia precisa de pelo menos 4 personagens ativos.' }),
    actions,
    renderImportSection(),
    el('div', { className: 'row spaced' }, [button('Baixar referência (JSON)', downloadReference, 'quiet')]),
    el('div', { className: 'note', text: 'A referência traz tudo o que dá para criar (campos, limites, habilidades, efeitos, estados) com exemplos prontos para importar.' }),
  ]);
  const right = state.formDraft ? renderCharacterForm(state.formDraft) : el('div', { className: 'muted', text: 'Nenhum personagem.' });
  return el('div', { className: 'columns' }, [left, right]);
}

/** Texto da área de importação (mantido ao refazer a tela). */
let importText = '';

/** Importa personagens colados como texto JSON: um, uma lista, ou `{ "characters": [...] }`. */
function renderImportSection(): HTMLElement {
  const area = el('textarea', { value: importText });
  area.className = 'small-area import-area';
  area.spellcheck = false;
  area.placeholder = '{ "id": "novo_personagem", ... }   ou   [ { ... }, { ... } ]   ou   { "characters": [ ... ] }';
  area.addEventListener('input', () => {
    importText = area.value;
  });
  const asInactive = el('input', { type: 'checkbox' });
  asInactive.checked = true;
  const replaceExisting = el('input', { type: 'checkbox' });
  const result = el('div', { className: 'error' });

  const run = button('Importar', () => {
    const working = state.working;
    if (!working) return;
    if (!confirmLeavingDraft()) return;
    const outcome = importCharacters(working, area.value, { asInactive: asInactive.checked, replaceExisting: replaceExisting.checked });
    if (!outcome.ok) {
      result.className = 'error';
      result.textContent = `Nada foi importado:\n${outcome.errors.join('\n')}`;
      return;
    }
    const changedIds = [...outcome.added, ...outcome.replaced];
    state.working = outcome.content;
    const firstId = changedIds[0];
    state.selectedCharacter = Math.max(0, outcome.content.characters.findIndex((character) => character.id === firstId));
    importText = '';
    loadDraft();
    const parts = [
      outcome.added.length > 0 ? `${outcome.added.length} novo(s): ${outcome.added.join(', ')}` : '',
      outcome.replaced.length > 0 ? `${outcome.replaced.length} substituído(s): ${outcome.replaced.join(', ')}` : '',
      ...outcome.notes,
    ].filter((part) => part !== '');
    state.message = { kind: 'ok', text: `Importado (ainda não publicado). ${parts.join(' · ')}` };
    render();
  });

  return el('details', { className: 'section' }, [
    el('summary', { text: 'Importar personagens (JSON)' }),
    el('div', { className: 'note', text: 'Cole o JSON de um personagem, de uma lista ou { "characters": [...] }. É tudo ou nada: se algum tiver erro, nada entra e a lista de problemas aparece aqui.' }),
    area,
    el('label', { className: 'inline' }, [asInactive, 'Importar como inativos (recomendado)']),
    el('label', { className: 'inline' }, [replaceExisting, 'Substituir se o id já existir']),
    el('div', { className: 'row' }, [run]),
    result,
  ]);
}

/** Baixa o arquivo JSON com a referência do que dá para criar. */
function downloadReference(): void {
  const content = state.working ?? state.published;
  if (!content) return;
  const guide = buildReferenceGuide(content);
  const blob = new Blob([JSON.stringify(guide, null, 2)], { type: 'application/json' });
  const link = el('a', { attributes: { href: URL.createObjectURL(blob), download: 'merge-do-escritorio-referencia-de-conteudo.json' } });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

/** Valida o rascunho; se estiver válido ele entra no conteúdo em edição. */
function commitDraft(next: Draft): void {
  state.formDraft = next;
  const working = state.working;
  const isSynergy = state.tab === 'synergies';
  const parsed = isSynergy ? synergySchema.safeParse(next) : characterSchema.safeParse(next);
  if (parsed.success && working) {
    state.draftIssues = [];
    state.working = isSynergy
      ? { ...working, synergies: working.synergies.map((synergy, index) => (index === state.selectedSynergy ? (parsed.data as typeof synergy) : synergy)) }
      : { ...working, characters: working.characters.map((character, index) => (index === state.selectedCharacter ? (parsed.data as typeof character) : character)) };
  } else if (!parsed.success) {
    state.draftIssues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  }
  state.message = null;
  attackPreview?.update(next);
  refreshStatus();
}

/** Muda o rascunho e refaz a tela (para mudanças que trocam quais campos existem). */
function commitDraftAndRender(next: Draft): void {
  commitDraft(next);
  render();
}

function renderCharacterForm(draft: Draft): HTMLElement {
  const form = el('div', { className: 'form' });
  form.append(el('div', { className: 'muted', text: `Id: ${String(draft.id)} (fixo; para mudar, use o JSON avançado)` }));
  form.append(renderSpriteSection(draft));
  form.append(section('Dados básicos', renderFields(BASIC_FIELDS), true));
  form.append(section('Atributos (escala de 1 a 10)', renderFields(STAT_FIELDS), true));
  form.append(section('Comportamento em combate', renderFields(BEHAVIOR_FIELDS), false));
  form.append(renderAttackSection(draft));
  form.append(renderAbilitySection(draft));
  form.append(section('Evolução por estrelas', renderFields(EVOLUTION_FIELDS), false));
  form.append(renderAdvancedSection(draft));
  return form;
}

function renderAttackSection(draft: Draft): HTMLElement {
  attackPreview = createAttackPreview();
  attackPreview.update(draft);
  return section('Ataque básico (área)', el('div', {}, [renderFields(ATTACK_FIELDS), attackPreview.element]), true);
}

function section(title: string, content: HTMLElement, open: boolean): HTMLElement {
  const box = el('details', { className: 'section' }, [el('summary', { text: title }), content]);
  box.open = open;
  return box;
}

function renderFields(specs: readonly FieldSpec[]): HTMLElement {
  return el('div', { className: 'grid' }, specs.map((spec) => renderField(spec)));
}

function renderField(spec: FieldSpec): HTMLElement {
  const draft = state.formDraft as Draft;
  const current = getAt(draft, spec.path) ?? spec.fallback;
  let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  switch (spec.kind) {
    case 'select': {
      const select = el('select');
      if (spec.optional) select.append(el('option', { value: '', text: '(nenhum)' }));
      for (const option of spec.options ?? []) select.append(el('option', { value: option.value, text: option.label }));
      select.value = typeof current === 'string' ? current : '';
      input = select;
      break;
    }
    case 'textarea': {
      const area = el('textarea', { value: typeof current === 'string' ? current : '' });
      area.className = 'small-area';
      input = area;
      break;
    }
    case 'checkbox': {
      const box = el('input', { type: 'checkbox' });
      box.checked = current === true;
      input = box;
      break;
    }
    case 'color': {
      input = el('input', { type: 'color', value: typeof current === 'string' ? current : '#ffffff' });
      break;
    }
    case 'number':
    case 'integer': {
      const number = el('input', { type: 'text', value: current === undefined || current === null ? '' : String(current) });
      number.inputMode = 'decimal';
      if (spec.min !== undefined || spec.max !== undefined) number.title = `Entre ${spec.min ?? '−∞'} e ${spec.max ?? '∞'}`;
      input = number;
      break;
    }
    default:
      input = el('input', { type: 'text', value: typeof current === 'string' ? current : '' });
  }

  input.addEventListener('change', () => {
    const raw = spec.kind === 'checkbox' ? (input as HTMLInputElement).checked : input.value;
    const value = parseFieldInput(spec, raw);
    const next = setAt(state.formDraft as Draft, spec.path, value);
    const isStructural = spec.path.join('.').endsWith('behavior.id');
    if (isStructural) {
      const effectPath = spec.path.slice(0, -2);
      commitDraftAndRender(setAt(next, [...effectPath, 'behavior'], newRegisteredBehavior(String(value))));
      return;
    }
    commitDraft(next);
  });

  const wrapper = field(spec.label, input, spec.help);
  if (spec.kind === 'checkbox') wrapper.classList.add('inline');
  return wrapper;
}

// --- Habilidade e efeitos ----------------------------------------------------------------------------

function renderAbilitySection(draft: Draft): HTMLElement {
  const content = el('div');
  content.append(renderFields(ABILITY_FIELDS));

  const activationType = String(getAt(draft, ['ability', 'activation', 'type']) ?? 'passive');
  const activationSelect = el('select');
  for (const option of ACTIVATION_TYPE_OPTIONS) activationSelect.append(el('option', { value: option.value, text: option.label }));
  activationSelect.value = activationType;
  activationSelect.addEventListener('change', () => {
    commitDraftAndRender(setAt(state.formDraft as Draft, ['ability', 'activation'], newActivation(activationSelect.value)));
  });
  content.append(el('div', { className: 'grid' }, [field('Quando usa', activationSelect), ...(ACTIVATION_FIELDS[activationType] ?? []).map((spec) => renderField(spec))]));

  content.append(el('h3', { text: 'Onde atua' }), renderFields(CAST_FIELDS));
  content.append(el('h3', { text: 'Efeitos (executados em ordem)' }), renderEffects(draft));
  return section('Habilidade', content, true);
}

function renderEffects(draft: Draft): HTMLElement {
  const effects = (getAt(draft, ['ability', 'effects']) as unknown[] | undefined) ?? [];
  const container = el('div', { className: 'effects' });

  effects.forEach((effect, index) => {
    const path = ['ability', 'effects', index];
    const typeSelect = el('select');
    for (const option of EFFECT_TYPE_OPTIONS) typeSelect.append(el('option', { value: option.value, text: option.label }));
    typeSelect.value = String(getAt(effect, ['type']));
    typeSelect.addEventListener('change', () => {
      if (window.confirm('Trocar o tipo do efeito apaga os valores dele. Continuar?')) {
        commitDraftAndRender(setAt(state.formDraft as Draft, path, newEffect(typeSelect.value as EffectType)));
      } else {
        typeSelect.value = String(getAt(effect, ['type']));
      }
    });
    const header = el('div', { className: 'row' }, [
      el('strong', { text: `Efeito ${index + 1}` }),
      typeSelect,
      button(
        'Remover efeito',
        () => {
          if (effects.length <= 1) {
            state.message = { kind: 'error', text: 'Toda habilidade precisa de ao menos um efeito.' };
            refreshStatus();
            return;
          }
          commitDraftAndRender(setAt(state.formDraft as Draft, path, undefined));
        },
        'danger',
      ),
    ]);
    const fields = effectFields(effect, path);
    const box = el('div', { className: 'effect' }, [header, el('div', { className: 'grid' }, fields.map((spec) => renderField(spec)))]);
    if (getAt(effect, ['behavior', 'id']) === 'random_attack') {
      box.append(el('div', { className: 'note', text: 'Os resultados possíveis do ataque aleatório (chance e dano de cada um) são editados no JSON avançado, abaixo.' }));
    }
    container.append(box);
  });

  const addSelect = el('select');
  for (const option of EFFECT_TYPE_OPTIONS) addSelect.append(el('option', { value: option.value, text: option.label }));
  container.append(
    el('div', { className: 'row' }, [
      addSelect,
      button('Adicionar efeito', () => {
        const next = setAt(state.formDraft as Draft, ['ability', 'effects', effects.length], newEffect(addSelect.value as EffectType));
        commitDraftAndRender(next);
      }),
    ]),
  );
  return container;
}

// --- Sprite ---------------------------------------------------------------------------------------

function renderSpriteSection(draft: Draft): HTMLElement {
  const sprite = getAt(draft, ['sprite']) as { path?: string } | undefined;
  const content = el('div');
  const status = el('div', { className: 'error' });

  const preview = el('div', { className: 'sprite-preview' });
  const image = el('img', { attributes: { alt: 'Prévia do sprite', width: '96', height: '96' } });
  image.style.display = 'none';
  const placeholder = el('div', { className: 'muted', text: sprite?.path ? '' : 'Sem sprite: o jogo usa o desenho provisório.' });
  if (sprite?.path) {
    image.src = `${state.serverUrl}${sprite.path}`;
    image.style.display = 'block';
    image.addEventListener('error', () => {
      image.style.display = 'none';
      placeholder.textContent = 'Não foi possível carregar a imagem deste sprite do servidor.';
    });
  }
  preview.append(image, placeholder);

  const fileInput = el('input', { type: 'file', attributes: { accept: 'image/png' } });
  const upload = button('Enviar sprite', () => void uploadSprite(fileInput, status, image, placeholder));
  const actions = el('div', { className: 'row' }, [fileInput, upload]);
  if (sprite?.path) {
    actions.append(
      button('Ajustar com prévia', () => openSpriteAdjustment(String(draft.id)), 'quiet'),
      button(
        'Remover sprite',
        () => {
          commitDraftAndRender(setAt(state.formDraft as Draft, ['sprite'], undefined));
        },
        'quiet',
      ),
    );
  }

  content.append(
    el('div', { className: 'note', text: 'PNG com fundo transparente, de até 1 MB e 1024×1024 pixels, com o personagem de pé, de perfil, olhando para a DIREITA (o jogo espelha a imagem para a esquerda). Para acertar posição, tamanho e pés vendo o resultado, use "Ajustar com prévia" (aba "Sprites e ícones").' }),
    el('div', { className: 'row top' }, [preview, el('div', {}, [actions, status])]),
  );
  if (sprite?.path) {
    content.append(renderFields(SPRITE_FIELDS), el('div', { className: 'muted', text: `Arquivo: ${sprite.path}` }));
  }
  return section('Sprite', content, true);
}

function openSpriteAdjustment(characterId: string): void {
  if (!confirmLeavingDraft()) return;
  selectSpriteTarget({ kind: 'character', key: characterId });
  state.tab = 'sprites';
  state.message = null;
  loadDraft();
  render();
}

async function uploadSprite(fileInput: HTMLInputElement, status: HTMLElement, image: HTMLImageElement, placeholder: HTMLElement): Promise<void> {
  const file = fileInput.files?.[0];
  const draft = state.formDraft;
  if (!file || !draft || !state.client) {
    status.textContent = 'Escolha um arquivo PNG primeiro.';
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = checkSpriteBytes(bytes);
  if (problem) {
    status.textContent = problem;
    return;
  }
  // Prévia imediata, antes mesmo do envio terminar.
  const previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  image.src = previewUrl;
  image.style.display = 'block';
  placeholder.textContent = '';
  status.textContent = 'Enviando…';
  try {
    const path = await state.client.uploadSprite(String(draft.id), bytes);
    const existing = (getAt(draft, ['sprite']) as Record<string, unknown> | undefined) ?? DEFAULT_SPRITE_ADJUSTMENT;
    commitDraftAndRender(setAt(state.formDraft as Draft, ['sprite'], { ...DEFAULT_SPRITE_ADJUSTMENT, ...existing, path }));
  } catch (failure) {
    status.textContent = failure instanceof AdminRequestError ? failure.message : 'Não foi possível enviar o sprite.';
  }
}

// --- JSON avançado -------------------------------------------------------------------------------

function renderAdvancedSection(draft: Draft, title = 'Avançado (JSON do personagem)'): HTMLElement {
  const editor = el('textarea', { value: JSON.stringify(draft, null, 2) });
  editor.spellcheck = false;
  const error = el('div', { className: 'error' });
  const apply = button('Aplicar JSON', () => {
    try {
      const parsed = JSON.parse(editor.value) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('O JSON precisa ser um objeto.');
      commitDraftAndRender(parsed as Draft);
    } catch (failure) {
      error.textContent = `JSON inválido: ${failure instanceof Error ? failure.message : 'erro de leitura'}`;
    }
  });
  return section(title, el('div', {}, [el('div', { className: 'note', text: 'Aqui dá para mudar o id e editar tudo, inclusive os resultados do ataque aleatório.' }), editor, el('div', { className: 'row' }, [apply]), error]), false);
}

// --- Sinergias (formulário) ---------------------------------------------------------------------

function renderSynergies(working: GameContent): HTMLElement {
  const counts = synergyCounts(working);
  const list = el('div', { className: 'list' });
  working.synergies.forEach((synergy, index) => {
    const count = counts[index]?.count ?? 0;
    const dot = el('span', { className: 'dot' });
    dot.style.background = synergy.color;
    const row = el('div', { className: `item${index === state.selectedSynergy ? ' selected' : ''}` }, [
      dot,
      el('span', { className: 'name', text: synergy.name }),
      el('span', { className: count < 4 ? 'warn-text' : 'muted', text: `${count} pers.` }),
    ]);
    row.addEventListener('click', () => {
      if (index !== state.selectedSynergy && !confirmLeavingDraft()) return;
      state.selectedSynergy = index;
      state.message = null;
      loadDraft();
      render();
    });
    list.append(row);
  });

  const actions = el('div', { className: 'row' }, [
    button('Nova (cópia desta)', () => {
      if (!confirmLeavingDraft()) return;
      const result = addSynergyFrom(working, state.selectedSynergy);
      if (!result.ok) {
        state.message = { kind: 'error', text: result.error };
        refreshStatus();
        return;
      }
      state.working = result.content;
      state.selectedSynergy = result.content.synergies.length - 1;
      state.message = { kind: 'ok', text: 'Sinergia criada. Ela nasce sem personagens: distribua ao menos 4 na aba "Rotação e distribuição".' };
      loadDraft();
      render();
    }),
    button(
      'Remover',
      () => {
        const target = working.synergies[state.selectedSynergy];
        if (!target || !window.confirm(`Remover ${target.name}? Os personagens dela vão para as outras sinergias.`)) return;
        const result = removeSynergy(working, state.selectedSynergy);
        if (!result.ok) {
          state.message = { kind: 'error', text: result.error };
          refreshStatus();
          return;
        }
        state.working = result.content;
        state.selectedSynergy = Math.max(0, state.selectedSynergy - 1);
        loadDraft();
        render();
      },
      'danger',
    ),
  ]);

  const left = el('div', {}, [
    list,
    el('div', { className: 'note', text: 'De 3 a 5 sinergias. Cada uma precisa de pelo menos 4 personagens ativos (aba "Rotação e distribuição"). Os bônus dependem de quantos personagens da sinergia estão no tabuleiro.' }),
    actions,
    renderSynergyImportSection(),
    el('div', { className: 'row spaced' }, [button('Baixar referência (JSON)', downloadReference, 'quiet')]),
    el('div', { className: 'note', text: 'A referência também descreve os tipos de bônus de sinergia, com exemplos.' }),
  ]);
  const right = state.formDraft ? renderSynergyForm(state.formDraft) : el('div', { className: 'muted', text: 'Nenhuma sinergia.' });
  return el('div', { className: 'columns' }, [left, right]);
}

function renderSynergyForm(draft: Draft): HTMLElement {
  const form = el('div', { className: 'form' });
  form.append(el('div', { className: 'muted', text: `Id: ${String(draft.id)} (fixo; para mudar, use o JSON avançado)` }));
  form.append(section('Dados básicos', renderFields(SYNERGY_FIELDS), true));
  form.append(section('Níveis e bônus', renderTiers(draft), true));
  form.append(renderAdvancedSection(draft, 'Avançado (JSON da sinergia)'));
  return form;
}

function renderTiers(draft: Draft): HTMLElement {
  const tiers = (getAt(draft, ['tiers']) as unknown[] | undefined) ?? [];
  const container = el('div', { className: 'effects' });
  container.append(
    el('div', { className: 'note', text: 'O nível mais alto alcançado substitui os anteriores (não acumulam). "Unidades" é quantos personagens da sinergia precisam estar no tabuleiro.' }),
  );

  tiers.forEach((tier, tierIndex) => {
    const tierPath = ['tiers', tierIndex];
    const effects = (getAt(tier, ['effects']) as unknown[] | undefined) ?? [];
    const header = el('div', { className: 'row' }, [
      el('strong', { text: `Nível ${tierIndex + 1}` }),
      button(
        'Remover nível',
        () => {
          if (tiers.length <= 1) {
            state.message = { kind: 'error', text: 'Toda sinergia precisa de ao menos um nível.' };
            refreshStatus();
            return;
          }
          commitDraftAndRender(setAt(state.formDraft as Draft, tierPath, undefined));
        },
        'danger',
      ),
    ]);
    const box = el('div', { className: 'effect' }, [header, renderFields([{ path: [...tierPath, 'threshold'], label: 'Unidades da sinergia no tabuleiro', kind: 'integer', min: 1 }])]);

    effects.forEach((effect, effectIndex) => {
      const effectPath = [...tierPath, 'effects', effectIndex];
      const typeSelect = el('select');
      for (const option of SYNERGY_EFFECT_TYPE_OPTIONS) typeSelect.append(el('option', { value: option.value, text: option.label }));
      typeSelect.value = String(getAt(effect, ['type']));
      typeSelect.addEventListener('change', () => {
        if (window.confirm('Trocar o tipo do bônus apaga os valores dele. Continuar?')) {
          commitDraftAndRender(setAt(state.formDraft as Draft, effectPath, newSynergyEffect(typeSelect.value as SynergyEffectType)));
        } else {
          typeSelect.value = String(getAt(effect, ['type']));
        }
      });
      const effectHeader = el('div', { className: 'row' }, [
        typeSelect,
        button(
          'Remover bônus',
          () => {
            if (effects.length <= 1) {
              state.message = { kind: 'error', text: 'Todo nível precisa de ao menos um bônus.' };
              refreshStatus();
              return;
            }
            commitDraftAndRender(setAt(state.formDraft as Draft, effectPath, undefined));
          },
          'quiet',
        ),
      ]);
      box.append(el('div', { className: 'effect inner' }, [effectHeader, el('div', { className: 'grid' }, synergyEffectFields(effect, effectPath).map((spec) => renderField(spec)))]));
    });

    const addSelect = el('select');
    for (const option of SYNERGY_EFFECT_TYPE_OPTIONS) addSelect.append(el('option', { value: option.value, text: option.label }));
    box.append(
      el('div', { className: 'row' }, [
        addSelect,
        button('Adicionar bônus', () => {
          commitDraftAndRender(setAt(state.formDraft as Draft, [...tierPath, 'effects', effects.length], newSynergyEffect(addSelect.value as SynergyEffectType)));
        }),
      ]),
    );
    container.append(box);
  });

  const highest = Math.max(0, ...tiers.map((tier) => Number(getAt(tier, ['threshold'])) || 0));
  container.append(
    el('div', { className: 'row' }, [
      button('Adicionar nível', () => {
        commitDraftAndRender(setAt(state.formDraft as Draft, ['tiers', tiers.length], newSynergyTier(highest + 2)));
      }),
    ]),
  );
  return container;
}

/** Importa sinergias por texto JSON: uma, uma lista ou `{ "synergies": [...] }`. */
let synergyImportText = '';

function renderSynergyImportSection(): HTMLElement {
  const area = el('textarea', { value: synergyImportText });
  area.className = 'small-area import-area';
  area.spellcheck = false;
  area.placeholder = '{ "id": "nova_sinergia", "name": "...", ... }   ou   [ { ... } ]   ou   { "synergies": [ ... ] }';
  area.addEventListener('input', () => {
    synergyImportText = area.value;
  });
  const replaceExisting = el('input', { type: 'checkbox' });
  const result = el('div', { className: 'error' });
  const run = button('Importar', () => {
    const working = state.working;
    if (!working || !confirmLeavingDraft()) return;
    const outcome = importSynergies(working, area.value, { replaceExisting: replaceExisting.checked });
    if (!outcome.ok) {
      result.textContent = `Nada foi importado:\n${outcome.errors.join('\n')}`;
      return;
    }
    state.working = outcome.content;
    const firstId = [...outcome.added, ...outcome.replaced][0];
    state.selectedSynergy = Math.max(0, outcome.content.synergies.findIndex((synergy) => synergy.id === firstId));
    synergyImportText = '';
    loadDraft();
    const parts = [outcome.added.length > 0 ? `${outcome.added.length} nova(s): ${outcome.added.join(', ')}` : '', outcome.replaced.length > 0 ? `${outcome.replaced.length} substituída(s): ${outcome.replaced.join(', ')}` : ''].filter((part) => part !== '');
    const needsMembers = outcome.added.length > 0 ? ' Sinergias novas nascem sem personagens: distribua ao menos 4 na aba "Rotação e distribuição".' : '';
    state.message = { kind: 'ok', text: `Importado (ainda não publicado). ${parts.join(' · ')}.${needsMembers}` };
    render();
  });
  return el('details', { className: 'section' }, [
    el('summary', { text: 'Importar sinergias (JSON)' }),
    el('div', { className: 'note', text: 'Cole o JSON de uma sinergia, de uma lista ou { "synergies": [...] }. É tudo ou nada.' }),
    area,
    el('label', { className: 'inline' }, [replaceExisting, 'Substituir se o id já existir']),
    el('div', { className: 'row' }, [run]),
    result,
  ]);
}

/** Quem pertence a cada sinergia no lançamento: um seletor por personagem ativo e a contagem de cada sinergia. */
function renderDistribution(working: GameContent): HTMLElement {
  const countsBox = el('div', { className: 'row counts' });
  const paintCounts = () => {
    const current = state.working ?? working;
    countsBox.replaceChildren(
      ...synergyCounts(current).map((entry) => {
        const chip = el('span', { className: `chip${entry.count < 4 ? ' bad' : ''}`, text: `${entry.name}: ${entry.count}${entry.count < 4 ? ' (mínimo 4)' : ''}` });
        chip.style.borderColor = entry.color;
        return chip;
      }),
    );
  };
  paintCounts();

  const grid = el('div', { className: 'grid' });
  working.characters
    .filter((character) => character.active)
    .forEach((character) => {
      const select = el('select');
      select.append(el('option', { value: '', text: '(sem sinergia)' }));
      for (const synergy of working.synergies) select.append(el('option', { value: synergy.id, text: synergy.name }));
      select.value = working.initialSynergyMapping[character.id] ?? '';
      select.addEventListener('change', () => {
        const current = state.working;
        if (!current || select.value === '') return;
        state.working = setCharacterSynergy(current, character.id, select.value);
        paintCounts();
        refreshStatus();
      });
      grid.append(field(character.name, select));
    });

  return el('div', {}, [
    el('h3', { text: 'Distribuição de lançamento (rotação 0)' }),
    el('div', { className: 'note', text: 'Cada personagem ativo pertence a uma sinergia. Cada sinergia precisa de pelo menos 4 personagens; as quantidades não precisam ser iguais. Depois do lançamento, a rotação reembaralha a distribuição a cada intervalo (todos mudam de sinergia).' }),
    countsBox,
    grid,
  ]);
}

// --- Abas em JSON (sinergias, configuração, rotação) -------------------------------------------------

function renderSection(tab: TextSection): HTMLElement {
  const working = state.working as GameContent;
  if (tab === 'rotation') {
    return el('div', {}, [renderDistribution(working), el('h3', { text: 'Avançado: regra da rotação e distribuição em JSON' }), renderTextSection(tab, working)]);
  }
  return renderTextSection(tab, working);
}

function renderTextSection(tab: TextSection, working: GameContent): HTMLElement {
  const editor = el('textarea', { value: state.draft });
  editor.spellcheck = false;
  editor.addEventListener('input', () => {
    state.draft = editor.value;
  });
  const error = el('div', { className: 'error', text: state.draftError });
  const apply = button('Aplicar', () => {
    const result = applySectionText(working, tab, editor.value);
    if (!result.ok) {
      state.draftError = result.error;
      error.textContent = result.error;
      return;
    }
    state.working = result.content;
    state.draftError = '';
    state.message = { kind: 'ok', text: 'Alterações aplicadas (ainda não publicadas).' };
    render();
  });
  return el('div', {}, [el('div', { className: 'note', text: SECTION_HELP[tab] }), editor, el('div', { className: 'row' }, [apply]), error]);
}

// --- Ações --------------------------------------------------------------------------------------

async function publish(): Promise<void> {
  if (!state.client || !state.working) return;
  state.isBusy = true;
  state.message = null;
  state.publishIssues = [];
  render();
  try {
    const result = await state.client.publish(state.version, state.working);
    if (result.ok) {
      state.published = cloneContent(state.working);
      state.version = result.version;
      state.message = { kind: 'ok', text: `Publicado! Versão ${result.version}. Os jogadores conectados foram avisados.` };
    } else {
      state.message = { kind: 'error', text: result.message };
      state.publishIssues = result.issues;
      if (result.kind === 'unauthorized') state.client = null;
    }
  } catch (failure) {
    state.message = { kind: 'error', text: failure instanceof AdminRequestError ? failure.message : 'Não foi possível publicar.' };
  }
  state.isBusy = false;
  render();
}

async function discard(): Promise<void> {
  state.isBusy = true;
  render();
  try {
    await reloadFromServer();
    state.message = { kind: 'ok', text: 'Conteúdo recarregado do servidor.' };
  } catch (failure) {
    state.message = { kind: 'error', text: failure instanceof AdminRequestError ? failure.message : 'Não foi possível recarregar.' };
    if (failure instanceof AdminRequestError && failure.kind === 'unauthorized') state.client = null;
  }
  state.isBusy = false;
  render();
}

async function signOut(): Promise<void> {
  await state.client?.logout();
  state.client = null;
  state.working = null;
  state.published = null;
  state.formDraft = null;
  state.message = null;
  discardPendingAdjustment();
  render();
}

window.addEventListener('beforeunload', (event) => {
  if (hasPendingAdjustment() || (state.published && state.working && hasChanges(state.published, state.working))) {
    event.preventDefault();
  }
});

render();
