import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, volumeToGain } from './audioEngine';
import { loadSettings } from './audioSettings';
import { MINIMUM_INTERVAL_MS } from './effectThrottle';
import { gameAudio, mountAudioControls, type SoundEffect } from './index';
import { FakeEnvironment } from './testSupport';

const ALL_EFFECTS: readonly SoundEffect[] = [
  'attack',
  'ability',
  'purchase',
  'sell',
  'refresh',
  'tower_destroyed',
  'unit_death',
  'round_win',
  'round_loss',
  'click',
];

/** Mais que um compasso: dá tempo de o agendador criar as próximas notas, se a música estiver tocando. */
const SEVERAL_SECONDS = 8;

function createUnlockedEngine(): { engine: AudioEngine; environment: FakeEnvironment } {
  const environment = new FakeEnvironment();
  const engine = new AudioEngine(environment);
  environment.makeUserGesture();
  return { engine, environment };
}

/** Avança o relógio do áudio e o dos temporizadores juntos e conta os sons criados nesse trecho. */
function countSoundsWhileTimePasses(environment: FakeEnvironment, seconds: number): number {
  const countBefore = environment.context.soundSourceCount;
  for (let step = 0; step < seconds * 5; step++) {
    environment.context.currentTime += 0.2;
    vi.advanceTimersByTime(200);
  }
  return environment.context.soundSourceCount - countBefore;
}

describe('motor de áudio', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('só cria o AudioContext depois do primeiro gesto, e uma única vez', () => {
    const environment = new FakeEnvironment();
    const engine = new AudioEngine(environment);
    engine.startMusic();
    engine.play('click');

    expect(environment.createdContextCount).toBe(0);

    environment.makeUserGesture();
    environment.makeUserGesture();

    expect(environment.createdContextCount).toBe(1);
    expect(environment.context.state).toBe('running');
  });

  it('começa a música pedida antes do gesto assim que o áudio é liberado', () => {
    const environment = new FakeEnvironment();
    new AudioEngine(environment).startMusic();

    environment.makeUserGesture();

    expect(countSoundsWhileTimePasses(environment, SEVERAL_SECONDS)).toBeGreaterThan(0);
  });

  it('não toca música sem ela ter sido pedida', () => {
    const { environment } = createUnlockedEngine();

    expect(countSoundsWhileTimePasses(environment, SEVERAL_SECONDS)).toBe(0);
  });

  it('para a música com stopMusic e com a música desligada', () => {
    const { engine, environment } = createUnlockedEngine();

    engine.startMusic();
    engine.stopMusic();
    expect(countSoundsWhileTimePasses(environment, SEVERAL_SECONDS)).toBe(0);

    engine.startMusic();
    engine.updateSettings({ musicEnabled: false });
    expect(countSoundsWhileTimePasses(environment, SEVERAL_SECONDS)).toBe(0);

    engine.updateSettings({ musicEnabled: true });
    expect(countSoundsWhileTimePasses(environment, SEVERAL_SECONDS)).toBeGreaterThan(0);
  });

  it('chamar startMusic de novo não duplica as notas', () => {
    const single = createUnlockedEngine();
    single.engine.startMusic();
    const repeated = createUnlockedEngine();
    repeated.engine.startMusic();
    repeated.engine.startMusic();
    repeated.environment.makeUserGesture();

    expect(countSoundsWhileTimePasses(repeated.environment, 20)).toBe(countSoundsWhileTimePasses(single.environment, 20));
  });

  it('pausa a música com a aba oculta e retoma quando ela volta', () => {
    const { engine, environment } = createUnlockedEngine();
    engine.startMusic();

    environment.setPageHidden(true);
    expect(countSoundsWhileTimePasses(environment, SEVERAL_SECONDS)).toBe(0);

    environment.setPageHidden(false);
    expect(countSoundsWhileTimePasses(environment, SEVERAL_SECONDS)).toBeGreaterThan(0);
  });

  it('não toca efeitos com a aba oculta', () => {
    const { engine, environment } = createUnlockedEngine();
    environment.setPageHidden(true);

    engine.play('attack');

    expect(environment.context.soundSourceCount).toBe(0);
  });

  it.each(ALL_EFFECTS)('toca o efeito %s', (effect) => {
    const { engine, environment } = createUnlockedEngine();

    engine.play(effect);

    expect(environment.context.soundSourceCount).toBeGreaterThan(0);
  });

  it('aplica o limite de repetição ao tocar', () => {
    const { engine, environment } = createUnlockedEngine();
    engine.play('purchase');
    const countAfterFirst = environment.context.soundSourceCount;

    engine.play('purchase');
    expect(environment.context.soundSourceCount).toBe(countAfterFirst);

    environment.currentTimeMs += MINIMUM_INTERVAL_MS.purchase;
    engine.play('purchase');
    expect(environment.context.soundSourceCount).toBe(countAfterFirst * 2);
  });

  it('não toca efeitos desligados ou no volume zero', () => {
    const { engine, environment } = createUnlockedEngine();

    engine.updateSettings({ effectsEnabled: false });
    engine.play('click');
    engine.updateSettings({ effectsEnabled: true, effectsVolume: 0 });
    engine.play('purchase');

    expect(environment.context.soundSourceCount).toBe(0);
  });

  it('aplica os volumes separadamente nos dois canais', () => {
    const { engine, environment } = createUnlockedEngine();

    engine.updateSettings({ musicVolume: 0.2, effectsVolume: 0.9 });

    const [musicBus, effectsBus] = environment.context.gainNodes;
    expect(musicBus?.gain.value).toBeCloseTo(volumeToGain(0.2));
    expect(effectsBus?.gain.value).toBeCloseTo(volumeToGain(0.9));
  });

  it('salva as escolhas e devolve uma cópia delas', () => {
    const { engine, environment } = createUnlockedEngine();

    engine.updateSettings({ musicEnabled: false, musicVolume: 2 });

    expect(loadSettings(environment.storage)).toMatchObject({ musicEnabled: false, musicVolume: 1 });
    expect(engine.getSettings()).not.toBe(engine.getSettings());
  });

  it('segue funcionando sem Web Audio e sem armazenamento', () => {
    const environment = new FakeEnvironment(null, false);
    const engine = new AudioEngine(environment);

    expect(() => {
      engine.startMusic();
      environment.makeUserGesture();
      engine.play('attack');
      engine.updateSettings({ musicVolume: 0.1 });
      environment.setPageHidden(true);
      engine.stopMusic();
    }).not.toThrow();
    expect(engine.getSettings().musicVolume).toBe(0.1);
  });
});

describe('API exportada em Node', () => {
  it('não lança erro sem navegador', () => {
    expect(() => {
      gameAudio.startMusic();
      gameAudio.play('click');
      gameAudio.stopMusic();
      mountAudioControls()();
    }).not.toThrow();
  });
});
