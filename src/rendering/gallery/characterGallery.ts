/** Tela de consulta de personagens: um painel em DOM por cima do jogo. */
import type { SynergyMapping } from '@core/synergies/synergies';
import { createButton, createContainer, createElement, createSelect, type SpriteUrlResolver } from './galleryElements';
import { buildGalleryModel, type GalleryContent, type GalleryEntry, type GalleryModel } from './galleryModel';
import { COMPARISON_SIZE, DEFAULT_FILTER, filterAndSortEntries, SORT_OPTIONS, toggleComparisonChoice, type GalleryFilter, type SortKey } from './galleryQuery';
import { GALLERY_CSS } from './galleryStyles';
import { createCard, createComparisonView, createDetailView, type ViewContext } from './galleryViews';

export interface CharacterGalleryOptions {
  readonly content: GalleryContent;
  /** Distribuição de sinergias vigente; sem ela, vale a de lançamento. */
  readonly synergyMapping?: SynergyMapping;
  /** Transforma o caminho `/sprites/...` no endereço do servidor. */
  readonly spriteUrlOf?: SpriteUrlResolver;
  readonly onClose?: () => void;
}

type GalleryScreen = { readonly kind: 'list' } | { readonly kind: 'detail'; readonly id: string } | { readonly kind: 'comparison' };

/** O Phaser também escuta a janela: sem isto, um toque na galeria acionaria o que está no jogo atrás dela. */
const POINTER_EVENTS_KEPT_FROM_THE_GAME = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'mousedown',
  'mouseup',
  'mousemove',
  'click',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
  'wheel',
  'contextmenu',
];
const KEY_EVENTS_KEPT_FROM_THE_GAME = ['keydown', 'keyup', 'keypress'] as const;

class CharacterGallery {
  readonly root = createElement('div', 'galeria');
  private readonly toolbar = createElement('div', 'galeria-barra');
  private readonly body = createElement('div', 'galeria-conteudo');
  private readonly model: GalleryModel;
  private readonly spriteUrlOf: SpriteUrlResolver;
  private screen: GalleryScreen = { kind: 'list' };
  private filter: GalleryFilter = DEFAULT_FILTER;
  private comparisonIds: string[] = [];
  /** Onde a lista estava rolada, para voltar ao mesmo lugar. */
  private listScrollTop = 0;

  constructor(
    options: CharacterGalleryOptions,
    private readonly requestClose: () => void,
  ) {
    this.model = buildGalleryModel(options.content, options.synergyMapping);
    this.spriteUrlOf = options.spriteUrlOf ?? ((path) => path);
  }

  mount(): void {
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Personagens do jogo');
    for (const eventName of POINTER_EVENTS_KEPT_FROM_THE_GAME) {
      this.root.addEventListener(eventName, (event) => event.stopPropagation());
    }
    // Na captura da janela porque o foco pode estar fora do painel, e o teclado do jogo escuta a própria janela.
    for (const eventName of KEY_EVENTS_KEPT_FROM_THE_GAME) {
      window.addEventListener(eventName, this.keepKeyFromTheGame, true);
    }
    this.root.append(createElement('style', '', GALLERY_CSS), this.toolbar, this.body);
    this.render();
    document.body.append(this.root);
    this.focusToolbar();
  }

  unmount(): void {
    for (const eventName of KEY_EVENTS_KEPT_FROM_THE_GAME) {
      window.removeEventListener(eventName, this.keepKeyFromTheGame, true);
    }
    this.root.remove();
  }

  /** Só barra a propagação: o navegador continua tratando Tab, Enter e as setas das listas. */
  private readonly keepKeyFromTheGame = (event: Event): void => {
    event.stopPropagation();
    if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') {
      this.goBackOrClose();
    }
  };

  private goBackOrClose(): void {
    if (this.screen.kind === 'list') {
      this.requestClose();
      return;
    }
    this.showScreen({ kind: 'list' });
  }

  private showScreen(screen: GalleryScreen): void {
    if (this.screen.kind === 'list') {
      this.listScrollTop = this.body.scrollTop;
    }
    this.screen = screen;
    this.render();
    this.body.scrollTop = screen.kind === 'list' ? this.listScrollTop : 0;
    this.focusToolbar();
  }

  private render(): void {
    this.renderToolbar();
    this.body.replaceChildren(...this.screenContent());
  }

  /** Redesenha sem perder a rolagem (marcar para comparar, filtrar e ordenar). */
  private renderKeepingScroll(): void {
    const scrollTop = this.body.scrollTop;
    this.render();
    this.body.scrollTop = scrollTop;
  }

  private renderToolbar(): void {
    const closeButton = createButton('Fechar ✕', () => this.requestClose());
    const title = createElement('h2', '', this.screen.kind === 'comparison' ? 'Comparação' : 'Personagens');
    const isList = this.screen.kind === 'list';
    const leading = isList ? [title, ...this.listControls()] : [createButton('← Voltar', () => this.showScreen({ kind: 'list' })), title];
    this.toolbar.replaceChildren(...leading, ...this.comparisonControls(), closeButton);
  }

  /** O foco dentro do painel faz o teclado e os leitores de tela começarem nele. */
  private focusToolbar(): void {
    (this.toolbar.querySelector?.('button') as HTMLButtonElement | null | undefined)?.focus();
  }

  private listControls(): HTMLElement[] {
    const synergyOptions = [{ value: '', label: 'Todas as sinergias' }, ...this.model.synergies.map((synergy) => ({ value: synergy.id, label: synergy.name }))];
    const sortOptions = SORT_OPTIONS.map((option) => ({ value: option.key, label: option.label }));
    return [
      createSelect('Filtrar por sinergia', synergyOptions, this.filter.synergyId ?? '', (value) => this.changeFilter({ synergyId: value === '' ? null : value })),
      createSelect('Ordenar por', sortOptions, this.filter.sortKey, (value) => this.changeFilter({ sortKey: value as SortKey })),
    ];
  }

  private changeFilter(changes: Partial<GalleryFilter>): void {
    this.filter = { ...this.filter, ...changes };
    this.renderKeepingScroll();
  }

  private comparisonControls(): HTMLElement[] {
    if (this.comparisonIds.length === 0 || this.screen.kind === 'comparison') {
      return [];
    }
    const compareButton = createButton(`Comparar (${this.comparisonIds.length}/${COMPARISON_SIZE})`, () => this.showScreen({ kind: 'comparison' }));
    compareButton.disabled = this.comparisonIds.length < COMPARISON_SIZE;
    return [compareButton];
  }

  private screenContent(): HTMLElement[] {
    const screen = this.screen;
    if (screen.kind === 'detail') {
      const entry = this.entryOf(screen.id);
      return entry ? [createDetailView(entry, this.viewContext(), entry.id !== this.model.tower.id)] : this.listContent();
    }
    if (screen.kind === 'comparison') {
      const [first, second] = this.comparisonIds.map((id) => this.entryOf(id));
      return first && second ? [createComparisonView(first, second, this.viewContext())] : this.listContent();
    }
    return this.listContent();
  }

  private listContent(): HTMLElement[] {
    const context = this.viewContext();
    const entries = filterAndSortEntries(this.model.characters, this.filter);
    const characters =
      entries.length > 0
        ? createContainer('galeria-grade', ...entries.map((entry) => createCard(entry, context)))
        : createElement('p', 'galeria-apagado', 'Nenhum personagem com esse filtro.');
    const towerSection = createElement('h3', 'galeria-secao', 'Estrutura');
    return [characters, towerSection, createContainer('galeria-grade', createCard(this.model.tower, context, false))];
  }

  private viewContext(): ViewContext {
    return {
      spriteUrlOf: this.spriteUrlOf,
      comparisonIds: this.comparisonIds,
      openDetail: (id) => this.showScreen({ kind: 'detail', id }),
      toggleComparison: (id) => {
        this.comparisonIds = toggleComparisonChoice(this.comparisonIds, id);
        this.renderKeepingScroll();
      },
    };
  }

  private entryOf(id: string): GalleryEntry | undefined {
    return [...this.model.characters, this.model.tower].find((entry) => entry.id === id);
  }
}

interface OpenGallery {
  readonly root: HTMLElement;
  readonly close: () => void;
}

let openGallery: OpenGallery | null = null;

/** Abre a galeria e devolve a função que a fecha. Com ela já aberta, devolve a mesma função, sem duplicar. */
export function openCharacterGallery(options: CharacterGalleryOptions): () => void {
  if (typeof document === 'undefined') {
    return () => undefined;
  }
  if (openGallery?.root.isConnected) {
    return openGallery.close;
  }
  openGallery?.close();
  let isClosed = false;
  const close = (): void => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    gallery.unmount();
    if (openGallery?.close === close) {
      openGallery = null;
    }
    options.onClose?.();
  };
  const gallery = new CharacterGallery(options, close);
  gallery.mount();
  openGallery = { root: gallery.root, close };
  return close;
}
