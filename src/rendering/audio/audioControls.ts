import { createChannelControls, createDiv, createToggleButton, createTextButton, type ChannelControls } from './audioControlElements';
import type { AudioSettings, GameAudio } from './types';

const CONTROLS_ID = 'controles-de-som';
/** O Phaser também escuta a janela: sem isto, um toque no painel acionaria o que está no jogo atrás dele. */
const EVENTS_KEPT_FROM_THE_GAME = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel', 'keydown', 'keyup', 'wheel'];

const ROOT_STYLE = [
  'position:fixed',
  'right:calc(env(safe-area-inset-right, 0px) + 8px)',
  'bottom:calc(env(safe-area-inset-bottom, 0px) + 2px)',
  'z-index:900',
  'display:flex',
  'flex-direction:column',
  'align-items:flex-end',
  'gap:8px',
  'font-family:Arial,sans-serif',
  'font-size:14px',
  'color:#e5e7eb',
  'touch-action:manipulation',
  'user-select:none',
].join(';');

const PANEL_STYLE = [
  'box-sizing:border-box',
  'flex-direction:column',
  'gap:4px',
  'width:min(260px, calc(100vw - 16px))',
  'max-height:calc(100vh - 64px)',
  'overflow-y:auto',
  'padding:12px 14px',
  'background:#111a2e',
  'border:1px solid #2f3e5c',
  'border-radius:10px',
  'box-shadow:0 8px 24px rgba(0,0,0,0.5)',
].join(';');

/** O botão de som e o painel que ele abre. */
class AudioControls {
  readonly root = createDiv(ROOT_STYLE);
  private readonly panel = createDiv(PANEL_STYLE);
  private readonly toggleButton = createToggleButton('♪', 'Som');
  private readonly music: ChannelControls;
  private readonly effects: ChannelControls;
  private isOpen = false;

  constructor(private readonly audio: GameAudio) {
    this.music = this.createMusicControls();
    this.effects = this.createEffectsControls();
    this.buildElements();
    this.listenForOpeningAndClosing();
    this.setOpen(false);
  }

  mount(): void {
    document.addEventListener('pointerdown', this.closeOnOutsideTap, true);
    document.body.append(this.root);
  }

  unmount(): void {
    document.removeEventListener('pointerdown', this.closeOnOutsideTap, true);
    this.root.remove();
  }

  private buildElements(): void {
    this.root.id = CONTROLS_ID;
    keepEventsFromTheGame(this.root);
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Configurações de som');
    const closeButton = createTextButton('Fechar');
    closeButton.addEventListener('click', () => this.setOpenWithClick(false));
    this.panel.append(...this.music.elements, ...this.effects.elements, closeButton);
    this.root.append(this.panel, this.toggleButton);
  }

  private createMusicControls(): ChannelControls {
    return createChannelControls({
      toggleLabel: 'Música',
      volumeLabel: 'Volume da música',
      onToggle: (musicEnabled) => this.change({ musicEnabled }),
      onVolume: (musicVolume) => this.change({ musicVolume }),
    });
  }

  private createEffectsControls(): ChannelControls {
    return createChannelControls({
      toggleLabel: 'Efeitos',
      volumeLabel: 'Volume dos efeitos',
      onToggle: (effectsEnabled) => {
        this.change({ effectsEnabled });
        this.audio.play('click');
      },
      onVolume: (effectsVolume) => this.change({ effectsVolume }),
      onVolumeChosen: () => this.audio.play('click'),
    });
  }

  private listenForOpeningAndClosing(): void {
    this.toggleButton.addEventListener('click', () => this.setOpenWithClick(!this.isOpen));
    this.root.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') {
        this.setOpen(false);
      }
    });
  }

  private readonly closeOnOutsideTap = (event: Event): void => {
    if (!this.isOpen || this.root.contains(event.target as Node)) {
      return;
    }
    this.setOpen(false);
  };

  private setOpenWithClick(shouldOpen: boolean): void {
    this.setOpen(shouldOpen);
    this.audio.play('click');
  }

  private setOpen(shouldOpen: boolean): void {
    this.isOpen = shouldOpen;
    this.panel.style.display = shouldOpen ? 'flex' : 'none';
    this.toggleButton.setAttribute('aria-expanded', String(shouldOpen));
    this.refresh();
  }

  private change(changes: Partial<AudioSettings>): void {
    this.audio.updateSettings(changes);
    this.refresh();
  }

  private refresh(): void {
    const settings = this.audio.getSettings();
    this.music.refresh(settings.musicEnabled, settings.musicVolume);
    this.effects.refresh(settings.effectsEnabled, settings.effectsVolume);
    this.showMutedState(settings);
  }

  /** Com música e efeitos desligados, o botão aparece riscado. */
  private showMutedState(settings: AudioSettings): void {
    const isMuted = !settings.musicEnabled && !settings.effectsEnabled;
    this.toggleButton.style.textDecoration = isMuted ? 'line-through' : 'none';
    this.toggleButton.style.opacity = isMuted ? '0.6' : '1';
  }
}

interface MountedControls {
  readonly root: HTMLElement;
  readonly unmount: () => void;
}

let mountedControls: MountedControls | null = null;

export function mountAudioControlsFor(audio: GameAudio): () => void {
  if (typeof document === 'undefined') {
    return () => undefined;
  }
  if (mountedControls?.root.isConnected) {
    return mountedControls.unmount;
  }
  mountedControls?.unmount();
  const controls = new AudioControls(audio);
  controls.mount();
  const unmount = (): void => {
    controls.unmount();
    if (mountedControls?.root === controls.root) {
      mountedControls = null;
    }
  };
  mountedControls = { root: controls.root, unmount };
  return unmount;
}

function keepEventsFromTheGame(element: HTMLElement): void {
  for (const eventName of EVENTS_KEPT_FROM_THE_GAME) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
}
