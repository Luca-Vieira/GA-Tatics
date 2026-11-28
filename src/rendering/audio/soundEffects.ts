import { scheduleNoise, scheduleTone, type NoiseSpec, type ToneSpec } from './synth';
import type { SoundEffect } from './types';

interface EffectRecipe {
  readonly tones?: readonly ToneSpec[];
  readonly noises?: readonly NoiseSpec[];
  /** Variação aleatória de altura (0.1 = até 10% para cima ou para baixo), para repetições não soarem idênticas. */
  readonly pitchVariation?: number;
}

/** Sequência de notas iguais no timbre, uma depois da outra (para fanfarras e brilhos). */
function arpeggio(frequencies: readonly number[], stepSeconds: number, durationSeconds: number, gain: number, waveform: OscillatorType = 'triangle'): ToneSpec[] {
  return frequencies.map((frequency, index) => ({ waveform, frequency, delaySeconds: index * stepSeconds, durationSeconds, gain }));
}

/**
 * Os golpes são feitos em camadas: um estalo de ruído (o contato) e um grave que cai de altura (o peso). O balanço de
 * quem bate e o impacto em quem apanha são sons separados, na hora em que cada um aparece na tela.
 */
const EFFECT_RECIPES: Readonly<Record<SoundEffect, EffectRecipe>> = {
  attack: {
    noises: [{ filterType: 'bandpass', frequency: 700, endFrequency: 2600, durationSeconds: 0.07, gain: 0.1 }],
    pitchVariation: 0.12,
  },
  hit: {
    tones: [
      { waveform: 'sine', frequency: 190, endFrequency: 62, durationSeconds: 0.11, gain: 0.34 },
      { waveform: 'square', frequency: 320, endFrequency: 110, durationSeconds: 0.04, gain: 0.07 },
    ],
    noises: [{ filterType: 'lowpass', frequency: 3200, endFrequency: 500, durationSeconds: 0.07, gain: 0.26 }],
    pitchVariation: 0.18,
  },
  shot: {
    tones: [{ waveform: 'triangle', frequency: 520, endFrequency: 1250, durationSeconds: 0.07, gain: 0.1 }],
    noises: [{ filterType: 'highpass', frequency: 2500, durationSeconds: 0.05, gain: 0.07 }],
    pitchVariation: 0.14,
  },
  ranged_hit: {
    tones: [
      { waveform: 'triangle', frequency: 940, endFrequency: 430, durationSeconds: 0.07, gain: 0.18 },
      { waveform: 'sine', frequency: 160, endFrequency: 80, durationSeconds: 0.08, gain: 0.2 },
    ],
    noises: [{ filterType: 'bandpass', frequency: 2400, durationSeconds: 0.035, gain: 0.16 }],
    pitchVariation: 0.16,
  },
  splash_hit: {
    tones: [{ waveform: 'sine', frequency: 140, endFrequency: 60, durationSeconds: 0.09, gain: 0.18 }],
    noises: [{ filterType: 'lowpass', frequency: 1800, endFrequency: 300, durationSeconds: 0.09, gain: 0.18 }],
    pitchVariation: 0.2,
  },
  ability_hit: {
    tones: [
      { waveform: 'sine', frequency: 130, endFrequency: 42, durationSeconds: 0.22, gain: 0.36 },
      { waveform: 'sawtooth', frequency: 420, endFrequency: 90, durationSeconds: 0.13, gain: 0.08 },
    ],
    noises: [{ filterType: 'lowpass', frequency: 2600, endFrequency: 200, durationSeconds: 0.2, gain: 0.28 }],
    pitchVariation: 0.1,
  },
  miss: {
    noises: [{ filterType: 'bandpass', frequency: 1500, endFrequency: 400, durationSeconds: 0.14, gain: 0.09 }],
    pitchVariation: 0.1,
  },
  heal: {
    tones: [
      { waveform: 'sine', frequency: 587, durationSeconds: 0.22, gain: 0.12, attackSeconds: 0.03 },
      { waveform: 'sine', frequency: 880, delaySeconds: 0.07, durationSeconds: 0.26, gain: 0.11, attackSeconds: 0.03 },
      { waveform: 'sine', frequency: 1175, delaySeconds: 0.14, durationSeconds: 0.3, gain: 0.08, attackSeconds: 0.03 },
    ],
    pitchVariation: 0.04,
  },
  poison: {
    tones: [
      { waveform: 'sine', frequency: 240, endFrequency: 420, durationSeconds: 0.07, gain: 0.13 },
      { waveform: 'sine', frequency: 180, endFrequency: 330, delaySeconds: 0.06, durationSeconds: 0.07, gain: 0.1 },
    ],
    pitchVariation: 0.25,
  },
  buff: {
    tones: arpeggio([440, 554, 659], 0.045, 0.13, 0.1),
    pitchVariation: 0.05,
  },
  debuff: {
    tones: [
      { waveform: 'sawtooth', frequency: 330, endFrequency: 150, durationSeconds: 0.24, gain: 0.06 },
      { waveform: 'sine', frequency: 220, endFrequency: 100, durationSeconds: 0.28, gain: 0.14 },
    ],
    pitchVariation: 0.08,
  },
  summon: {
    tones: [{ waveform: 'sine', frequency: 260, endFrequency: 780, durationSeconds: 0.16, gain: 0.2 }],
    noises: [{ filterType: 'bandpass', frequency: 900, endFrequency: 3000, durationSeconds: 0.16, gain: 0.12 }],
    pitchVariation: 0.1,
  },
  trap: {
    tones: [{ waveform: 'square', frequency: 900, endFrequency: 180, durationSeconds: 0.09, gain: 0.12 }],
    noises: [{ filterType: 'highpass', frequency: 1800, durationSeconds: 0.07, gain: 0.22 }],
  },
  terrain: {
    tones: [{ waveform: 'sine', frequency: 210, endFrequency: 70, durationSeconds: 0.18, gain: 0.18 }],
    noises: [{ filterType: 'lowpass', frequency: 900, endFrequency: 250, durationSeconds: 0.26, gain: 0.2 }],
    pitchVariation: 0.12,
  },
  ability: {
    tones: [
      { waveform: 'sine', frequency: 440, endFrequency: 880, durationSeconds: 0.24, gain: 0.18, attackSeconds: 0.03 },
      { waveform: 'triangle', frequency: 660, endFrequency: 1320, delaySeconds: 0.05, durationSeconds: 0.2, gain: 0.08, attackSeconds: 0.03 },
    ],
    noises: [{ filterType: 'bandpass', frequency: 600, endFrequency: 4000, durationSeconds: 0.22, gain: 0.07 }],
    pitchVariation: 0.05,
  },
  unit_death: {
    tones: [
      { waveform: 'triangle', frequency: 360, endFrequency: 70, durationSeconds: 0.28, gain: 0.2 },
      { waveform: 'sine', frequency: 110, endFrequency: 45, delaySeconds: 0.08, durationSeconds: 0.22, gain: 0.24 },
    ],
    noises: [{ filterType: 'lowpass', frequency: 1400, endFrequency: 150, durationSeconds: 0.25, gain: 0.16 }],
    pitchVariation: 0.1,
  },
  tower_destroyed: {
    tones: [{ waveform: 'sine', frequency: 150, endFrequency: 40, durationSeconds: 0.7, gain: 0.35 }],
    noises: [
      { filterType: 'lowpass', frequency: 1100, endFrequency: 120, durationSeconds: 0.8, gain: 0.4 },
      { filterType: 'bandpass', frequency: 2200, endFrequency: 600, delaySeconds: 0.12, durationSeconds: 0.35, gain: 0.14 },
    ],
  },
  combat_start: {
    tones: [
      { waveform: 'sine', frequency: 120, endFrequency: 48, durationSeconds: 0.45, gain: 0.4 },
      { waveform: 'sawtooth', frequency: 220, delaySeconds: 0.05, durationSeconds: 0.35, gain: 0.06, attackSeconds: 0.04 },
      { waveform: 'sawtooth', frequency: 330, delaySeconds: 0.05, durationSeconds: 0.35, gain: 0.05, attackSeconds: 0.04 },
    ],
    noises: [{ filterType: 'highpass', frequency: 3500, durationSeconds: 0.5, gain: 0.08 }],
  },
  countdown: {
    tones: [{ waveform: 'square', frequency: 880, durationSeconds: 0.06, gain: 0.07 }],
  },
  purchase: {
    tones: [
      { waveform: 'triangle', frequency: 659, durationSeconds: 0.09, gain: 0.22 },
      { waveform: 'triangle', frequency: 988, delaySeconds: 0.07, durationSeconds: 0.18, gain: 0.22 },
      { waveform: 'sine', frequency: 1976, delaySeconds: 0.07, durationSeconds: 0.12, gain: 0.07 },
    ],
  },
  sell: {
    tones: [
      { waveform: 'triangle', frequency: 880, durationSeconds: 0.09, gain: 0.2 },
      { waveform: 'triangle', frequency: 587, delaySeconds: 0.07, durationSeconds: 0.18, gain: 0.2 },
    ],
  },
  refresh: {
    noises: [{ filterType: 'bandpass', frequency: 500, endFrequency: 2800, durationSeconds: 0.2, gain: 0.18 }],
  },
  fusion: {
    tones: [...arpeggio([523, 659, 784, 1047, 1319], 0.06, 0.22, 0.17), { waveform: 'sine', frequency: 2093, delaySeconds: 0.3, durationSeconds: 0.45, gain: 0.08 }],
    noises: [{ filterType: 'highpass', frequency: 5000, delaySeconds: 0.24, durationSeconds: 0.35, gain: 0.07 }],
  },
  error: {
    tones: [
      { waveform: 'square', frequency: 196, durationSeconds: 0.08, gain: 0.07 },
      { waveform: 'square', frequency: 165, delaySeconds: 0.09, durationSeconds: 0.12, gain: 0.07 },
    ],
  },
  round_win: {
    tones: [...arpeggio([523, 659, 784], 0.12, 0.18, 0.22), { waveform: 'triangle', frequency: 1047, delaySeconds: 0.36, durationSeconds: 0.55, gain: 0.24 }],
  },
  round_loss: {
    tones: [
      { waveform: 'triangle', frequency: 392, durationSeconds: 0.3, gain: 0.2, attackSeconds: 0.02 },
      { waveform: 'triangle', frequency: 311, delaySeconds: 0.22, durationSeconds: 0.3, gain: 0.2, attackSeconds: 0.02 },
      { waveform: 'triangle', frequency: 262, delaySeconds: 0.44, durationSeconds: 0.7, gain: 0.2, attackSeconds: 0.02 },
    ],
  },
  match_win: {
    tones: [
      ...arpeggio([523, 659, 784, 1047], 0.14, 0.2, 0.22),
      { waveform: 'triangle', frequency: 784, delaySeconds: 0.7, durationSeconds: 0.18, gain: 0.2 },
      { waveform: 'triangle', frequency: 1047, delaySeconds: 0.86, durationSeconds: 0.9, gain: 0.24 },
      { waveform: 'sine', frequency: 523, delaySeconds: 0.86, durationSeconds: 0.9, gain: 0.14 },
    ],
  },
  match_loss: {
    tones: [
      ...arpeggio([440, 392, 349], 0.28, 0.34, 0.2),
      { waveform: 'triangle', frequency: 294, delaySeconds: 0.84, durationSeconds: 0.9, gain: 0.2 },
      { waveform: 'sine', frequency: 147, delaySeconds: 0.84, durationSeconds: 0.9, gain: 0.16 },
    ],
  },
  click: {
    tones: [{ waveform: 'sine', frequency: 720, endFrequency: 540, durationSeconds: 0.05, gain: 0.16 }],
  },
};

export function playSoundEffect(context: BaseAudioContext, destination: AudioNode, effect: SoundEffect): void {
  const recipe = EFFECT_RECIPES[effect];
  const pitch = randomPitch(recipe.pitchVariation ?? 0);
  const startTime = context.currentTime;
  for (const tone of recipe.tones ?? []) {
    scheduleTone(context, destination, shiftPitch(tone, pitch), startTime);
  }
  for (const noise of recipe.noises ?? []) {
    scheduleNoise(context, destination, noise, startTime);
  }
}

function randomPitch(variation: number): number {
  return 1 + (Math.random() * 2 - 1) * variation;
}

function shiftPitch(tone: ToneSpec, pitch: number): ToneSpec {
  const endFrequency = tone.endFrequency === undefined ? undefined : tone.endFrequency * pitch;
  return { ...tone, frequency: tone.frequency * pitch, endFrequency };
}
