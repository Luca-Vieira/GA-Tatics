import { COMBAT_BARS, COMBAT_BEATS_PER_MINUTE, HI_HAT_BEATS, KICK_BEATS, SNARE_BEATS, STAB_BEATS } from './combatScore';
import { BEATS_PER_BAR, BEATS_PER_MINUTE, MUSIC_BARS, type MusicBar } from './musicScore';
import { scheduleNoise, scheduleTone } from './synth';
import type { MusicMood } from './types';

/** Cada compasso é agendado com esta antecedência, para um engasgo da página não atrasar as notas. */
const LOOKAHEAD_SECONDS = 1.5;
const SCHEDULER_INTERVAL_MS = 200;
const START_DELAY_SECONDS = 0.1;
const FADE_IN_SECONDS: Readonly<Record<MusicMood, number>> = { calm: 1.5, combat: 0.3 };
const FADE_OUT_TIME_CONSTANT = 0.08;
const FADE_OUT_CLEANUP_MS = 600;

/** Como cada clima toca: a partitura, o andamento e o arranjo de um compasso. */
interface MusicTheme {
  readonly bars: readonly MusicBar[];
  readonly secondsPerBeat: number;
  scheduleBar(context: BaseAudioContext, track: AudioNode, bar: MusicBar, barTime: number, secondsPerBeat: number): void;
}

const THEMES: Readonly<Record<MusicMood, MusicTheme>> = {
  calm: { bars: MUSIC_BARS, secondsPerBeat: 60 / BEATS_PER_MINUTE, scheduleBar: scheduleCalmBar },
  combat: { bars: COMBAT_BARS, secondsPerBeat: 60 / COMBAT_BEATS_PER_MINUTE, scheduleBar: scheduleCombatBar },
};

/**
 * Toca a partitura do clima atual em laço. Ao parar e voltar, cada clima continua do compasso seguinte; o do combate
 * recomeça do início a cada luta.
 */
export class MusicPlayer {
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  /** Cada vez que a música toca ganha um canal próprio: ao parar, ele leva junto as notas já agendadas. */
  private track: GainNode | null = null;
  private readonly nextBarIndexes: Record<MusicMood, number> = { calm: 0, combat: 0 };
  private nextBarTime = 0;
  private mood: MusicMood = 'calm';

  constructor(
    private readonly context: BaseAudioContext,
    private readonly destination: AudioNode,
  ) {}

  get isPlaying(): boolean {
    return this.schedulerTimer !== null;
  }

  /** Troca o clima; se a música estiver tocando, a troca acontece na hora, com uma passagem curta. */
  setMood(mood: MusicMood): void {
    if (mood === this.mood) {
      return;
    }
    const wasPlaying = this.isPlaying;
    this.stop();
    this.mood = mood;
    if (mood === 'combat') {
      this.nextBarIndexes.combat = 0;
    }
    if (wasPlaying) {
      this.start();
    }
  }

  start(): void {
    if (this.isPlaying) {
      return;
    }
    this.track = this.createTrack();
    this.nextBarTime = this.context.currentTime + START_DELAY_SECONDS;
    this.scheduleDueBars();
    this.schedulerTimer = setInterval(() => this.scheduleDueBars(), SCHEDULER_INTERVAL_MS);
  }

  stop(): void {
    if (this.schedulerTimer === null) {
      return;
    }
    clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
    this.fadeOutTrack();
  }

  private createTrack(): GainNode {
    const track = this.context.createGain();
    const now = this.context.currentTime;
    track.gain.setValueAtTime(0, now);
    track.gain.linearRampToValueAtTime(1, now + FADE_IN_SECONDS[this.mood]);
    track.connect(this.destination);
    return track;
  }

  private fadeOutTrack(): void {
    const track = this.track;
    if (track === null) {
      return;
    }
    this.track = null;
    const now = this.context.currentTime;
    track.gain.cancelScheduledValues(now);
    track.gain.setTargetAtTime(0, now, FADE_OUT_TIME_CONSTANT);
    setTimeout(() => track.disconnect(), FADE_OUT_CLEANUP_MS);
  }

  private scheduleDueBars(): void {
    // Depois de um atraso longo, retoma do presente em vez de despejar os compassos perdidos de uma vez.
    if (this.nextBarTime < this.context.currentTime) {
      this.nextBarTime = this.context.currentTime + START_DELAY_SECONDS;
    }
    while (this.nextBarTime < this.context.currentTime + LOOKAHEAD_SECONDS) {
      this.scheduleNextBar();
    }
  }

  private scheduleNextBar(): void {
    const theme = THEMES[this.mood];
    const barIndex = this.nextBarIndexes[this.mood];
    const bar = theme.bars[barIndex];
    if (bar && this.track) {
      theme.scheduleBar(this.context, this.track, bar, this.nextBarTime, theme.secondsPerBeat);
    }
    this.nextBarIndexes[this.mood] = (barIndex + 1) % theme.bars.length;
    this.nextBarTime += theme.secondsPerBeat * BEATS_PER_BAR;
  }
}

/** Calmo: acorde que entra devagar e se mistura com o seguinte, baixo longo e melodia suave. */
function scheduleCalmBar(context: BaseAudioContext, track: AudioNode, bar: MusicBar, barTime: number, secondsPerBeat: number): void {
  for (const note of bar.chord) {
    scheduleTone(
      context,
      track,
      { waveform: 'sine', frequency: noteFrequency(note), durationSeconds: secondsPerBeat * BEATS_PER_BAR + 0.6, gain: 0.11, attackSeconds: 0.9, releaseSeconds: 1.1 },
      barTime,
    );
  }
  scheduleTone(context, track, { waveform: 'triangle', frequency: noteFrequency(bar.bass), durationSeconds: secondsPerBeat * 3.5, gain: 0.18, attackSeconds: 0.08 }, barTime);
  for (const melodyNote of bar.melody) {
    scheduleTone(
      context,
      track,
      {
        waveform: 'sine',
        frequency: noteFrequency(melodyNote.note),
        delaySeconds: melodyNote.beat * secondsPerBeat,
        durationSeconds: melodyNote.beats * secondsPerBeat,
        gain: 0.12,
        attackSeconds: 0.04,
      },
      barTime,
    );
  }
}

/** Combate: baixo em colcheias saltando de oitava, bateria, acordes curtos no contratempo e uma frase por cima. */
function scheduleCombatBar(context: BaseAudioContext, track: AudioNode, bar: MusicBar, barTime: number, secondsPerBeat: number): void {
  for (let eighth = 0; eighth < BEATS_PER_BAR * 2; eighth++) {
    const note = bar.bass + (eighth % 2 === 0 ? 12 : 24);
    scheduleTone(
      context,
      track,
      { waveform: 'sawtooth', frequency: noteFrequency(note), delaySeconds: (eighth / 2) * secondsPerBeat, durationSeconds: secondsPerBeat * 0.42, gain: eighth % 2 === 0 ? 0.1 : 0.06 },
      barTime,
    );
  }
  scheduleDrums(context, track, barTime, secondsPerBeat);
  for (const beat of STAB_BEATS) {
    for (const note of bar.chord) {
      scheduleTone(context, track, { waveform: 'square', frequency: noteFrequency(note), delaySeconds: beat * secondsPerBeat, durationSeconds: 0.1, gain: 0.025 }, barTime);
    }
  }
  for (const melodyNote of bar.melody) {
    scheduleTone(
      context,
      track,
      { waveform: 'square', frequency: noteFrequency(melodyNote.note), delaySeconds: melodyNote.beat * secondsPerBeat, durationSeconds: melodyNote.beats * secondsPerBeat, gain: 0.055, attackSeconds: 0.01 },
      barTime,
    );
  }
}

function scheduleDrums(context: BaseAudioContext, track: AudioNode, barTime: number, secondsPerBeat: number): void {
  for (const beat of KICK_BEATS) {
    scheduleTone(context, track, { waveform: 'sine', frequency: 150, endFrequency: 45, delaySeconds: beat * secondsPerBeat, durationSeconds: 0.14, gain: 0.34 }, barTime);
  }
  for (const beat of SNARE_BEATS) {
    scheduleNoise(context, track, { filterType: 'bandpass', frequency: 1900, delaySeconds: beat * secondsPerBeat, durationSeconds: 0.14, gain: 0.22 }, barTime);
    scheduleTone(context, track, { waveform: 'triangle', frequency: 210, endFrequency: 160, delaySeconds: beat * secondsPerBeat, durationSeconds: 0.09, gain: 0.12 }, barTime);
  }
  HI_HAT_BEATS.forEach((beat, index) => {
    scheduleNoise(context, track, { filterType: 'highpass', frequency: 7000, delaySeconds: beat * secondsPerBeat, durationSeconds: 0.04, gain: index % 2 === 0 ? 0.07 : 0.045 }, barTime);
  });
}

/** Lá central (nota 69) = 440 Hz; cada 12 notas dobram a frequência. */
export function noteFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
