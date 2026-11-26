import type { AudioSettings } from './types';

export const SETTINGS_STORAGE_KEY = 'merge-do-escritorio:audio';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicEnabled: true,
  effectsEnabled: true,
  musicVolume: 0.5,
  effectsVolume: 0.7,
};

/** A parte do `localStorage` usada aqui. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Aplica as mudanças sobre as configurações atuais, ignorando valores de tipo errado e limitando os volumes. */
export function mergeSettings(current: AudioSettings, changes: unknown): AudioSettings {
  if (!isRecord(changes)) {
    return { ...current };
  }
  return {
    musicEnabled: readBoolean(changes.musicEnabled, current.musicEnabled),
    effectsEnabled: readBoolean(changes.effectsEnabled, current.effectsEnabled),
    musicVolume: readVolume(changes.musicVolume, current.musicVolume),
    effectsVolume: readVolume(changes.effectsVolume, current.effectsVolume),
  };
}

export function loadSettings(storage: SettingsStorage | null): AudioSettings {
  if (storage === null) {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
  try {
    const savedText = storage.getItem(SETTINGS_STORAGE_KEY);
    if (savedText === null) {
      return { ...DEFAULT_AUDIO_SETTINGS };
    }
    return mergeSettings(DEFAULT_AUDIO_SETTINGS, JSON.parse(savedText));
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveSettings(storage: SettingsStorage | null, settings: AudioSettings): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Armazenamento cheio ou bloqueado: a escolha vale só até a página ser fechada.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}
