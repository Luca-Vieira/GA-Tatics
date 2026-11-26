/**
 * Partitura da música de fundo: 16 compassos lentos em dó maior (cerca de 50 segundos por volta). Os compassos 9 a 12
 * ficam sem melodia, para o ouvido descansar. Notas em número MIDI (60 = dó central); `beat` conta a partir de 0.
 */
export interface MelodyNote {
  readonly beat: number;
  readonly note: number;
  readonly beats: number;
}

export interface MusicBar {
  readonly bass: number;
  readonly chord: readonly number[];
  readonly melody: readonly MelodyNote[];
}

export const BEATS_PER_MINUTE = 76;
export const BEATS_PER_BAR = 4;

const C_MAJOR_SEVENTH = { bass: 48, chord: [55, 59, 64] };
const A_MINOR_SEVENTH = { bass: 45, chord: [55, 60, 64] };
const F_MAJOR_SEVENTH = { bass: 41, chord: [57, 60, 64] };
const G_SIXTH = { bass: 43, chord: [55, 59, 64] };
const E_MINOR_SEVENTH = { bass: 40, chord: [55, 59, 62] };
const D_MINOR_SEVENTH = { bass: 38, chord: [57, 60, 65] };
const G_SUSPENDED = { bass: 43, chord: [55, 60, 65] };

export const MUSIC_BARS: readonly MusicBar[] = [
  { ...C_MAJOR_SEVENTH, melody: [{ beat: 0, note: 76, beats: 1.5 }, { beat: 2, note: 79, beats: 2 }] },
  { ...A_MINOR_SEVENTH, melody: [{ beat: 1, note: 76, beats: 1 }, { beat: 2.5, note: 72, beats: 1.5 }] },
  { ...F_MAJOR_SEVENTH, melody: [{ beat: 0, note: 74, beats: 1.5 }, { beat: 2, note: 76, beats: 2 }] },
  { ...G_SIXTH, melody: [{ beat: 1.5, note: 74, beats: 2 }] },
  { ...E_MINOR_SEVENTH, melody: [{ beat: 0, note: 79, beats: 2 }, { beat: 2.5, note: 76, beats: 1.5 }] },
  { ...A_MINOR_SEVENTH, melody: [{ beat: 1, note: 81, beats: 1 }, { beat: 2, note: 79, beats: 2 }] },
  { ...D_MINOR_SEVENTH, melody: [{ beat: 0, note: 77, beats: 1.5 }, { beat: 2, note: 74, beats: 2 }] },
  { ...G_SUSPENDED, melody: [{ beat: 2, note: 72, beats: 2 }] },
  { ...F_MAJOR_SEVENTH, melody: [] },
  { ...E_MINOR_SEVENTH, melody: [] },
  { ...D_MINOR_SEVENTH, melody: [] },
  { ...G_SUSPENDED, melody: [] },
  { ...C_MAJOR_SEVENTH, melody: [{ beat: 0, note: 76, beats: 1.5 }, { beat: 2, note: 79, beats: 1 }, { beat: 3, note: 83, beats: 1 }] },
  { ...A_MINOR_SEVENTH, melody: [{ beat: 0, note: 81, beats: 2 }, { beat: 2.5, note: 76, beats: 1.5 }] },
  { ...F_MAJOR_SEVENTH, melody: [{ beat: 1, note: 72, beats: 1 }, { beat: 2, note: 76, beats: 2 }] },
  { ...G_SIXTH, melody: [{ beat: 0, note: 74, beats: 3 }] },
];
