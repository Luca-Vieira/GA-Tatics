import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS, loadSettings, mergeSettings, saveSettings, SETTINGS_STORAGE_KEY } from './audioSettings';
import { createMemoryStorage } from './testSupport';

describe('configurações de áudio', () => {
  it('usa o padrão sem armazenamento ou sem nada salvo', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(loadSettings(createMemoryStorage())).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('recupera o que foi salvo', () => {
    const storage = createMemoryStorage();
    const chosen = { musicEnabled: false, effectsEnabled: true, musicVolume: 0.2, effectsVolume: 0 };

    saveSettings(storage, chosen);

    expect(loadSettings(storage)).toEqual(chosen);
  });

  it.each(['não é json', 'null', '42', '"texto"', '[]', '{}'])('tolera lixo salvo: %s', (garbage) => {
    const storage = createMemoryStorage({ [SETTINGS_STORAGE_KEY]: garbage });

    expect(loadSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('aproveita os campos válidos e troca os inválidos pelo padrão', () => {
    const storage = createMemoryStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ musicEnabled: false, effectsEnabled: 'sim', musicVolume: 7, effectsVolume: null }) });

    expect(loadSettings(storage)).toEqual({ ...DEFAULT_AUDIO_SETTINGS, musicEnabled: false, musicVolume: 1 });
  });

  it('limita os volumes entre 0 e 1 e ignora números inválidos', () => {
    expect(mergeSettings(DEFAULT_AUDIO_SETTINGS, { musicVolume: -3 }).musicVolume).toBe(0);
    expect(mergeSettings(DEFAULT_AUDIO_SETTINGS, { effectsVolume: Number.NaN }).effectsVolume).toBe(DEFAULT_AUDIO_SETTINGS.effectsVolume);
    expect(mergeSettings(DEFAULT_AUDIO_SETTINGS, { musicVolume: undefined }).musicVolume).toBe(DEFAULT_AUDIO_SETTINGS.musicVolume);
  });

  it('não propaga erros de um armazenamento bloqueado', () => {
    const blockedStorage = {
      getItem: (): string | null => {
        throw new Error('bloqueado');
      },
      setItem: (): void => {
        throw new Error('bloqueado');
      },
    };

    expect(loadSettings(blockedStorage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(() => saveSettings(blockedStorage, DEFAULT_AUDIO_SETTINGS)).not.toThrow();
  });
});
