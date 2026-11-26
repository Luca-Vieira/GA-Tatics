import { BEATS_PER_BAR, BEATS_PER_MINUTE, MUSIC_BARS, type MusicBar } from './musicScore';
import { scheduleTone } from './synth';

const SECONDS_PER_BEAT = 60 / BEATS_PER_MINUTE;
const BAR_SECONDS = SECONDS_PER_BEAT * BEATS_PER_BAR;
/** Cada compasso é agendado com esta antecedência, para um engasgo da página não atrasar as notas. */
const LOOKAHEAD_SECONDS = 1.5;
const SCHEDULER_INTERVAL_MS = 200;
const START_DELAY_SECONDS = 0.1;
const FADE_IN_SECONDS = 1.5;
const FADE_OUT_TIME_CONSTANT = 0.08;
const FADE_OUT_CLEANUP_MS = 600;

/** Toca a partitura em laço. Ao parar e voltar, continua do compasso seguinte. */
export class MusicPlayer {
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  /** Cada vez que a música toca ganha um canal próprio: ao parar, ele leva junto as notas já agendadas. */
  private track: GainNode | null = null;
  private nextBarIndex = 0;
  private nextBarTime = 0;

  constructor(
    private readonly context: BaseAudioContext,
    private readonly destination: AudioNode,
  ) {}

  get isPlaying(): boolean {
    return this.schedulerTimer !== null;
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
    track.gain.linearRampToValueAtTime(1, now + FADE_IN_SECONDS);
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
    const bar = MUSIC_BARS[this.nextBarIndex];
    if (bar && this.track) {
      this.scheduleBar(this.track, bar, this.nextBarTime);
    }
    this.nextBarIndex = (this.nextBarIndex + 1) % MUSIC_BARS.length;
    this.nextBarTime += BAR_SECONDS;
  }

  private scheduleBar(track: AudioNode, bar: MusicBar, barTime: number): void {
    this.schedulePad(track, bar, barTime);
    this.scheduleBass(track, bar, barTime);
    this.scheduleMelody(track, bar, barTime);
  }

  /** Acorde de fundo, que entra devagar e se mistura com o do compasso seguinte. */
  private schedulePad(track: AudioNode, bar: MusicBar, barTime: number): void {
    for (const note of bar.chord) {
      scheduleTone(
        this.context,
        track,
        { waveform: 'sine', frequency: noteFrequency(note), durationSeconds: BAR_SECONDS + 0.6, gain: 0.11, attackSeconds: 0.9, releaseSeconds: 1.1 },
        barTime,
      );
    }
  }

  private scheduleBass(track: AudioNode, bar: MusicBar, barTime: number): void {
    scheduleTone(
      this.context,
      track,
      { waveform: 'triangle', frequency: noteFrequency(bar.bass), durationSeconds: SECONDS_PER_BEAT * 3.5, gain: 0.18, attackSeconds: 0.08 },
      barTime,
    );
  }

  private scheduleMelody(track: AudioNode, bar: MusicBar, barTime: number): void {
    for (const melodyNote of bar.melody) {
      scheduleTone(
        this.context,
        track,
        {
          waveform: 'sine',
          frequency: noteFrequency(melodyNote.note),
          delaySeconds: melodyNote.beat * SECONDS_PER_BEAT,
          durationSeconds: melodyNote.beats * SECONDS_PER_BEAT,
          gain: 0.12,
          attackSeconds: 0.04,
        },
        barTime,
      );
    }
  }
}

/** Lá central (nota 69) = 440 Hz; cada 12 notas dobram a frequência. */
export function noteFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
