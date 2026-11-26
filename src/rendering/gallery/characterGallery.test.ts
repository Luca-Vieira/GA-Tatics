import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { openCharacterGallery } from './index';

/** O mínimo de DOM que a galeria usa (o projeto não tem uma biblioteca de DOM para testes). */
class FakeElement {
  className = '';
  type = '';
  value = '';
  alt = '';
  src = '';
  textContent = '';
  disabled = false;
  scrollTop = 0;
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(
    readonly tagName: string,
    private readonly isDocumentRoot = false,
  ) {}

  get isConnected(): boolean {
    if (this.isDocumentRoot) {
      return true;
    }
    let ancestor = this.parent;
    while (ancestor !== null && !ancestor.isDocumentRoot) {
      ancestor = ancestor.parent;
    }
    return ancestor !== null;
  }

  append(...added: FakeElement[]): void {
    for (const child of added) {
      child.parent = this;
      this.children.push(child);
    }
  }

  replaceChildren(...added: FakeElement[]): void {
    this.children.forEach((child) => (child.parent = null));
    this.children = [];
    this.append(...added);
  }

  remove(): void {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(eventName: string, listener: (event: unknown) => void): void {
    this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
  }

  emit(eventName: string): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener({ target: this, stopPropagation: () => undefined });
    }
  }

  findAll(matches: (element: FakeElement) => boolean): FakeElement[] {
    const found: FakeElement[] = [];
    const pending: FakeElement[] = [this];
    while (pending.length > 0) {
      const element = pending.shift() as FakeElement;
      if (matches(element)) {
        found.push(element);
      }
      pending.push(...element.children);
    }
    return found;
  }
}

describe('galeria na tela', () => {
  let body: FakeElement;
  let keyListeners: Map<string, (event: unknown) => void>;

  beforeEach(() => {
    body = new FakeElement('body', true);
    keyListeners = new Map();
    vi.stubGlobal('document', {
      body,
      createElement: (tagName: string) => new FakeElement(tagName),
      createElementNS: (_namespace: string, tagName: string) => new FakeElement(tagName),
    });
    vi.stubGlobal('window', {
      addEventListener: (eventName: string, listener: (event: unknown) => void) => keyListeners.set(eventName, listener),
      removeEventListener: (eventName: string) => keyListeners.delete(eventName),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = (onClose?: () => void) => openCharacterGallery({ content: DEFAULT_GAME_CONTENT, onClose });
  const buttons = () => body.findAll((element) => element.tagName === 'button');
  const buttonWithText = (text: string) => {
    const button = buttons().find((candidate) => candidate.textContent === text);
    if (!button) {
      throw new Error(`Sem botão "${text}"`);
    }
    return button;
  };
  const openDetailOf = (name: string) =>
    buttons()
      .find((button) => button.attributes.get('aria-label') === `Ver detalhes de ${name}`)
      ?.emit('click');
  const hasText = (text: string) => body.findAll((element) => element.textContent.includes(text)).length > 0;
  const pressEscape = () => {
    const stopPropagation = vi.fn();
    keyListeners.get('keydown')?.({ type: 'keydown', key: 'Escape', stopPropagation });
    return stopPropagation;
  };

  it('abrir duas vezes não duplica, e fechar remove tudo e avisa uma vez só', () => {
    const onClose = vi.fn();
    const close = open(onClose);

    expect(open()).toBe(close);
    expect(body.children).toHaveLength(1);

    close();
    close();

    expect(body.children).toHaveLength(0);
    expect(keyListeners.size).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o botão de fechar fecha, e dá para abrir de novo', () => {
    open();
    buttonWithText('Fechar ✕').emit('click');
    expect(body.children).toHaveLength(0);

    const close = open();
    expect(body.children).toHaveLength(1);
    close();
  });

  it('Esc volta do detalhe para a lista e depois fecha, sem deixar a tecla chegar ao jogo', () => {
    open();
    openDetailOf('Gustavo');
    expect(hasText('Invoca: Cavalo')).toBe(true);

    expect(pressEscape()).toHaveBeenCalled();
    expect(hasText('Invoca: Cavalo')).toBe(false);
    expect(body.children).toHaveLength(1);

    pressEscape();
    expect(body.children).toHaveLength(0);
  });

  it('marca dois personagens e mostra os dois lado a lado, cada um com a sua área', () => {
    const close = open();
    buttons()
      .filter((button) => button.textContent === 'Comparar')
      .slice(0, 1)
      .forEach((button) => button.emit('click'));
    expect(buttonWithText('Comparar (1/2)').disabled).toBe(true);

    buttons()
      .filter((button) => button.textContent === 'Comparar')[0]
      ?.emit('click');
    buttonWithText('Comparar (2/2)').emit('click');

    expect(body.findAll((element) => element.className === 'galeria-comparacao')).toHaveLength(1);
    expect(body.findAll((element) => element.attributes.get('class') === 'galeria-mapa')).toHaveLength(2);
    close();
  });

  it('a torre abre sem área de ataque e sem botão de comparar', () => {
    const close = open();
    openDetailOf('Torre');

    expect(hasText('Não ataca nem se move.')).toBe(true);
    expect(buttons().some((button) => button.textContent === 'Comparar')).toBe(false);
    close();
  });

  it('usa o endereço resolvido para o sprite enviado e volta ao desenho se a imagem falhar', () => {
    const [first, ...others] = DEFAULT_GAME_CONTENT.characters;
    const sprite = { path: '/sprites/x-aaaaaaaaaaaa.png', scale: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 1 };
    const close = openCharacterGallery({
      content: { ...DEFAULT_GAME_CONTENT, characters: [{ ...first!, sprite }, ...others] },
      spriteUrlOf: (path) => `https://servidor.test${path}`,
    });
    const [image] = body.findAll((element) => element.tagName === 'img');

    expect(image?.src).toBe('https://servidor.test/sprites/x-aaaaaaaaaaaa.png');
    const portrait = image!.parent!;
    image!.emit('error');
    expect(portrait.children.map((child) => child.tagName)).toEqual(['svg']);
    close();
  });
});
