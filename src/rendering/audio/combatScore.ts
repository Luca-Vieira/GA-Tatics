/**
 * Partitura do combate: rápida, em lá menor, com bateria e baixo marcado. Oito compassos (cerca de 14 segundos por
 * volta). Notas em número MIDI; `beat` conta a partir de 0.
 */
import type { MelodyNote, MusicBar } from './musicScore';

export const COMBAT_BEATS_PER_MINUTE = 136;

const A_MINOR = { bass: 33, chord: [57, 60, 64] };
const F_MAJOR = { bass: 29, chord: [57, 60, 65] };
const C_MAJOR = { bass: 36, chord: [55, 60, 64] };
const G_MAJOR = { bass: 31, chord: [55, 59, 62] };
const E_MAJOR = { bass: 28, chord: [56, 59, 64] };

/** Frase curta de colcheias que se repete com pequenas mudanças. */
function riff(first: number, second: number, third: number): MelodyNote[] {
  return [
    { beat: 0, note: first, beats: 0.5 },
    { beat: 0.5, note: first, beats: 0.25 },
    { beat: 1, note: second, beats: 0.5 },
    { beat: 1.75, note: third, beats: 0.75 },
    { beat: 3, note: second, beats: 0.5 },
  ];
}

export const COMBAT_BARS: readonly MusicBar[] = [
  { ...A_MINOR, melody: riff(69, 72, 76) },
  { ...A_MINOR, melody: [] },
  { ...F_MAJOR, melody: riff(69, 72, 77) },
  { ...G_MAJOR, melody: [{ beat: 2, note: 74, beats: 0.5 }, { beat: 2.5, note: 76, beats: 0.5 }, { beat: 3, note: 79, beats: 1 }] },
  { ...A_MINOR, melody: riff(76, 79, 81) },
  { ...C_MAJOR, melody: [] },
  { ...F_MAJOR, melody: riff(77, 76, 72) },
  { ...E_MAJOR, melody: [{ beat: 0, note: 76, beats: 1 }, { beat: 1.5, note: 80, beats: 1 }, { beat: 3, note: 83, beats: 1 }] },
];

/** Bateria de um compasso, em tempos: bumbo, caixa e chimbal. */
export const KICK_BEATS = [0, 1.5, 2, 3.5] as const;
export const SNARE_BEATS = [1, 3] as const;
export const HI_HAT_BEATS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] as const;
/** Acordes curtos no contratempo. */
export const STAB_BEATS = [0.5, 1.5, 2.75] as const;
