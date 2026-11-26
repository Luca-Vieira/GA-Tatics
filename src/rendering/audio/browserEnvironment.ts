import type { AudioEnvironment } from './audioEngine';
import type { SettingsStorage } from './audioSettings';

/** Só o fim do toque vale como gesto no celular (`pointerdown` não conta), e nem todo navegador aceita os mesmos eventos. */
const GESTURE_EVENTS = ['pointerup', 'touchend', 'keydown', 'click'] as const;

type AudioContextConstructor = new () => AudioContext;

/** Todas as funções toleram a falta do navegador (testes em Node). */
export function createBrowserEnvironment(): AudioEnvironment {
  return {
    storage: findStorage(),
    createContext,
    nowMs: () => performance.now(),
    isPageHidden: () => typeof document !== 'undefined' && document.hidden,
    onUserGesture,
    onVisibilityChange,
  };
}

function findStorage(): SettingsStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    // Alguns navegadores lançam erro só de acessar o armazenamento bloqueado.
    return null;
  }
}

function createContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const webkitWindow = window as unknown as { webkitAudioContext?: AudioContextConstructor };
  const Constructor: AudioContextConstructor | undefined = window.AudioContext ?? webkitWindow.webkitAudioContext;
  if (!Constructor) {
    return null;
  }
  try {
    return new Constructor();
  } catch {
    return null;
  }
}

function onUserGesture(listener: () => void): void {
  if (typeof window === 'undefined') {
    return;
  }
  // Na fase de captura, o gesto chega aqui mesmo que um elemento da página interrompa a propagação.
  for (const eventName of GESTURE_EVENTS) {
    window.addEventListener(eventName, listener, { capture: true, passive: true });
  }
}

function onVisibilityChange(listener: () => void): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.addEventListener('visibilitychange', listener);
}
