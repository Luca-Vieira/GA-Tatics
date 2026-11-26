import { scheduleNoise, scheduleTone, type NoiseSpec, type ToneSpec } from './synth';
import type { SoundEffect } from './types';

interface EffectRecipe {
  readonly tones?: readonly ToneSpec[];
  readonly noises?: readonly NoiseSpec[];
  /** Variação aleatória de altura (0.1 = até 10% para cima ou para baixo), para repetições não soarem idênticas. */
  readonly pitchVariation?: number;
}

const EFFECT_RECIPES: Readonly<Record<SoundEffect, EffectRecipe>> = {
  attack: {
    tones: [{ waveform: 'triangle', frequency: 220, endFrequency: 130, durationSeconds: 0.06, gain: 0.12 }],
    noises: [{ filterType: 'bandpass', frequency: 1800, durationSeconds: 0.04, gain: 0.1 }],
    pitchVariation: 0.12,
  },
  ability: {
    tones: [
      { waveform: 'sine', frequency: 440, endFrequency: 880, durationSeconds: 0.24, gain: 0.18, attackSeconds: 0.03 },
      { waveform: 'triangle', frequency: 660, endFrequency: 1320, delaySeconds: 0.05, durationSeconds: 0.2, gain: 0.08, attackSeconds: 0.03 },
    ],
    pitchVariation: 0.05,
  },
  purchase: {
    tones: [
      { waveform: 'triangle', frequency: 659, durationSeconds: 0.09, gain: 0.22 },
      { waveform: 'triangle', frequency: 988, delaySeconds: 0.07, durationSeconds: 0.18, gain: 0.22 },
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
  tower_destroyed: {
    tones: [{ waveform: 'sine', frequency: 150, endFrequency: 40, durationSeconds: 0.7, gain: 0.35 }],
    noises: [{ filterType: 'lowpass', frequency: 1100, endFrequency: 120, durationSeconds: 0.8, gain: 0.4 }],
  },
  unit_death: {
    tones: [{ waveform: 'triangle', frequency: 320, endFrequency: 90, durationSeconds: 0.2, gain: 0.16 }],
    pitchVariation: 0.1,
  },
  round_win: {
    tones: [
      { waveform: 'triangle', frequency: 523, durationSeconds: 0.18, gain: 0.22 },
      { waveform: 'triangle', frequency: 659, delaySeconds: 0.12, durationSeconds: 0.18, gain: 0.22 },
      { waveform: 'triangle', frequency: 784, delaySeconds: 0.24, durationSeconds: 0.18, gain: 0.22 },
      { waveform: 'triangle', frequency: 1047, delaySeconds: 0.36, durationSeconds: 0.55, gain: 0.24 },
    ],
  },
  round_loss: {
    tones: [
      { waveform: 'triangle', frequency: 392, durationSeconds: 0.3, gain: 0.2, attackSeconds: 0.02 },
      { waveform: 'triangle', frequency: 311, delaySeconds: 0.22, durationSeconds: 0.3, gain: 0.2, attackSeconds: 0.02 },
      { waveform: 'triangle', frequency: 262, delaySeconds: 0.44, durationSeconds: 0.7, gain: 0.2, attackSeconds: 0.02 },
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
