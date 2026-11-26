/** Falsos para testar o áudio em Node, sem Web Audio nem navegador. */
import type { AudioEnvironment } from './audioEngine';
import type { SettingsStorage } from './audioSettings';

export function createMemoryStorage(initialEntries: Record<string, string> = {}): SettingsStorage {
  const entries = new Map(Object.entries(initialEntries));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
  };
}

class FakeAudioParam {
  value = 1;
  setValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  cancelScheduledValues(): void {}
  setTargetAtTime(target: number): void {
    this.value = target;
  }
}

class FakeAudioNode {
  readonly gain = new FakeAudioParam();
  readonly frequency = new FakeAudioParam();
  type = '';
  buffer: unknown = null;
  connect(): void {}
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}

export class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  readonly sampleRate = 100;
  readonly destination = new FakeAudioNode();
  /** Os dois primeiros ganhos criados pelo motor são os canais de música e de efeitos. */
  readonly gainNodes: FakeAudioNode[] = [];
  /** Quantas notas e ruídos foram criados: mostra se algum som foi tocado. */
  soundSourceCount = 0;

  async resume(): Promise<void> {
    this.state = 'running';
  }

  createGain(): FakeAudioNode {
    const node = new FakeAudioNode();
    this.gainNodes.push(node);
    return node;
  }

  createOscillator(): FakeAudioNode {
    this.soundSourceCount++;
    return new FakeAudioNode();
  }

  createBufferSource(): FakeAudioNode {
    this.soundSourceCount++;
    return new FakeAudioNode();
  }

  createBiquadFilter(): FakeAudioNode {
    return new FakeAudioNode();
  }

  createBuffer(_channels: number, length: number): { getChannelData(): Float32Array } {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }
}

export class FakeEnvironment implements AudioEnvironment {
  readonly context = new FakeAudioContext();
  createdContextCount = 0;
  currentTimeMs = 0;
  private isHidden = false;
  private gestureListener: () => void = () => undefined;
  private visibilityListener: () => void = () => undefined;

  constructor(
    readonly storage: SettingsStorage | null = createMemoryStorage(),
    private readonly hasWebAudio = true,
  ) {}

  createContext(): AudioContext | null {
    if (!this.hasWebAudio) {
      return null;
    }
    this.createdContextCount++;
    return this.context as unknown as AudioContext;
  }

  nowMs(): number {
    return this.currentTimeMs;
  }

  isPageHidden(): boolean {
    return this.isHidden;
  }

  onUserGesture(listener: () => void): void {
    this.gestureListener = listener;
  }

  onVisibilityChange(listener: () => void): void {
    this.visibilityListener = listener;
  }

  makeUserGesture(): void {
    this.gestureListener();
  }

  setPageHidden(isHidden: boolean): void {
    this.isHidden = isHidden;
    this.visibilityListener();
  }
}
