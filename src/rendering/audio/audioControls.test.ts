import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAudioControlsFor } from './audioControls';
import { AudioEngine } from './audioEngine';
import { FakeEnvironment } from './testSupport';

/** O mínimo de DOM que os controles usam (o projeto não tem uma biblioteca de DOM para testes). */
class FakeElement {
  id = '';
  type = '';
  title = '';
  value = '';
  textContent = '';
  checked = false;
  parent: FakeElement | null = null;
  readonly children: FakeElement[] = [];
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

  remove(): void {
    const siblings = this.parent?.children ?? [];
    const index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
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

function createFakeDocument() {
  return {
    body: new FakeElement('body', true),
    createElement: (tagName: string) => new FakeElement(tagName),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe('controles de som na tela', () => {
  let fakeDocument: ReturnType<typeof createFakeDocument>;

  beforeEach(() => {
    fakeDocument = createFakeDocument();
    vi.stubGlobal('document', fakeDocument);
  });
  afterEach(() => vi.unstubAllGlobals());

  const findByTag = (tagName: string) => fakeDocument.body.findAll((element) => element.tagName === tagName);
  const findByType = (type: string) => fakeDocument.body.findAll((element) => element.type === type);

  it('chamar duas vezes não duplica e a função devolvida remove tudo', () => {
    const audio = new AudioEngine(new FakeEnvironment());

    const unmount = mountAudioControlsFor(audio);
    const secondUnmount = mountAudioControlsFor(audio);

    expect(fakeDocument.body.children).toHaveLength(1);
    expect(secondUnmount).toBe(unmount);

    unmount();

    expect(fakeDocument.body.children).toHaveLength(0);
    expect(fakeDocument.removeEventListener).toHaveBeenCalledTimes(fakeDocument.addEventListener.mock.calls.length);
  });

  it('pode ser montado de novo depois de removido', () => {
    const audio = new AudioEngine(new FakeEnvironment());
    mountAudioControlsFor(audio)();

    const unmount = mountAudioControlsFor(audio);

    expect(fakeDocument.body.children).toHaveLength(1);
    unmount();
  });

  it('o botão abre e fecha o painel', () => {
    const unmount = mountAudioControlsFor(new AudioEngine(new FakeEnvironment()));
    const toggleButton = findByTag('button').find((button) => button.attributes.get('aria-label') === 'Som');
    const panel = fakeDocument.body.findAll((element) => element.attributes.get('role') === 'dialog')[0];

    expect(panel?.style.display).toBe('none');
    toggleButton?.emit('click');
    expect(panel?.style.display).toBe('flex');
    toggleButton?.emit('click');
    expect(panel?.style.display).toBe('none');
    unmount();
  });

  it('música e efeitos são ligados e ajustados separadamente', () => {
    const audio = new AudioEngine(new FakeEnvironment());
    const unmount = mountAudioControlsFor(audio);
    const [musicCheckbox, effectsCheckbox] = findByType('checkbox');
    const [musicSlider, effectsSlider] = findByType('range');
    if (!musicCheckbox || !effectsCheckbox || !musicSlider || !effectsSlider) {
      throw new Error('Controles não encontrados.');
    }

    musicCheckbox.checked = false;
    musicCheckbox.emit('change');
    expect(audio.getSettings()).toMatchObject({ musicEnabled: false, effectsEnabled: true });

    effectsSlider.value = '25';
    effectsSlider.emit('input');
    expect(audio.getSettings()).toMatchObject({ effectsVolume: 0.25, musicVolume: 0.5 });

    effectsCheckbox.checked = false;
    effectsCheckbox.emit('change');
    musicSlider.value = '80';
    musicSlider.emit('input');
    expect(audio.getSettings()).toEqual({ musicEnabled: false, effectsEnabled: false, musicVolume: 0.8, effectsVolume: 0.25 });
    unmount();
  });
});
