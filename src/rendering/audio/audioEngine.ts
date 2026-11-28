import { loadSettings, mergeSettings, saveSettings, type SettingsStorage } from './audioSettings';
import { EffectThrottle } from './effectThrottle';
import { MusicPlayer } from './musicPlayer';
import { playSoundEffect } from './soundEffects';
import type { AudioSettings, GameAudio, MusicMood, SoundEffect } from './types';

const VOLUME_SMOOTHING_SECONDS = 0.02;

/** Tudo que o motor precisa do navegador; nos testes, é trocado por uma versão falsa. */
export interface AudioEnvironment {
  readonly storage: SettingsStorage | null;
  /** `null` quando a Web Audio API não existe ou não pôde ser iniciada. */
  createContext(): AudioContext | null;
  nowMs(): number;
  isPageHidden(): boolean;
  onUserGesture(listener: () => void): void;
  onVisibilityChange(listener: () => void): void;
}

interface AudioGraph {
  readonly context: AudioContext;
  readonly musicBus: GainNode;
  readonly effectsBus: GainNode;
  readonly musicPlayer: MusicPlayer;
}

export class AudioEngine implements GameAudio {
  private settings: AudioSettings;
  private readonly throttle = new EffectThrottle();
  /** Só existe depois do primeiro gesto do usuário (política de reprodução automática dos navegadores). */
  private graph: AudioGraph | null = null;
  private isMusicRequested = false;
  private musicMood: MusicMood = 'calm';

  constructor(private readonly environment: AudioEnvironment) {
    this.settings = loadSettings(environment.storage);
    environment.onUserGesture(() => this.unlock());
    environment.onVisibilityChange(() => this.handleVisibilityChange());
  }

  /** Efeitos pedidos antes de o áudio estar liberado são descartados, para não tocarem todos juntos depois. */
  play(effect: SoundEffect): void {
    if (!this.areEffectsAudible()) {
      return;
    }
    const graph = this.graph;
    if (graph === null || graph.context.state !== 'running') {
      return;
    }
    if (!this.throttle.tryAcquire(effect, this.environment.nowMs())) {
      return;
    }
    playSoundEffect(graph.context, graph.effectsBus, effect);
  }

  /** Pode ser chamado antes do primeiro gesto: a música começa assim que o áudio for liberado. */
  startMusic(): void {
    this.isMusicRequested = true;
    this.syncMusic();
  }

  stopMusic(): void {
    this.isMusicRequested = false;
    this.syncMusic();
  }

  setMusicMood(mood: MusicMood): void {
    this.musicMood = mood;
    this.graph?.musicPlayer.setMood(mood);
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  updateSettings(changes: Partial<AudioSettings>): void {
    this.settings = mergeSettings(this.settings, changes);
    saveSettings(this.environment.storage, this.settings);
    this.applyVolumes();
    this.syncMusic();
  }

  private areEffectsAudible(): boolean {
    return this.settings.effectsEnabled && this.settings.effectsVolume > 0 && !this.environment.isPageHidden();
  }

  private unlock(): void {
    this.graph ??= this.createGraph();
    this.resumeContext();
    this.syncMusic();
  }

  private createGraph(): AudioGraph | null {
    const context = this.environment.createContext();
    if (context === null) {
      return null;
    }
    const musicBus = context.createGain();
    const effectsBus = context.createGain();
    musicBus.gain.value = volumeToGain(this.settings.musicVolume);
    effectsBus.gain.value = volumeToGain(this.settings.effectsVolume);
    musicBus.connect(context.destination);
    // Num combate cheio, muitos sons juntos estourariam: o compressor os segura sem baixar os que tocam sozinhos.
    const limiter = context.createDynamicsCompressor();
    effectsBus.connect(limiter);
    limiter.connect(context.destination);
    const musicPlayer = new MusicPlayer(context, musicBus);
    musicPlayer.setMood(this.musicMood);
    return { context, musicBus, effectsBus, musicPlayer };
  }

  /** No celular o áudio também pode ser interrompido depois de liberado (ligação, tela bloqueada). */
  private resumeContext(): void {
    const context = this.graph?.context;
    if (!context || context.state === 'running' || context.state === 'closed') {
      return;
    }
    context.resume().catch(() => {
      // Sem permissão ainda: o próximo gesto do usuário tenta de novo.
    });
  }

  private applyVolumes(): void {
    const graph = this.graph;
    if (graph === null) {
      return;
    }
    const now = graph.context.currentTime;
    graph.musicBus.gain.setTargetAtTime(volumeToGain(this.settings.musicVolume), now, VOLUME_SMOOTHING_SECONDS);
    graph.effectsBus.gain.setTargetAtTime(volumeToGain(this.settings.effectsVolume), now, VOLUME_SMOOTHING_SECONDS);
  }

  private syncMusic(): void {
    const player = this.graph?.musicPlayer;
    if (!player) {
      return;
    }
    if (this.shouldMusicPlay()) {
      player.start();
      return;
    }
    player.stop();
  }

  private shouldMusicPlay(): boolean {
    return this.isMusicRequested && this.settings.musicEnabled && !this.environment.isPageHidden();
  }

  private handleVisibilityChange(): void {
    if (!this.environment.isPageHidden()) {
      this.resumeContext();
    }
    this.syncMusic();
  }
}

/** O ouvido percebe volume de forma não linear: ao quadrado, o controle deslizante parece uniforme. */
export function volumeToGain(volume: number): number {
  return volume * volume;
}
