/** Blocos de síntese com a Web Audio API: uma nota de oscilador e um sopro de ruído filtrado. */

/** O ganho exponencial não aceita zero. */
const SILENCE = 0.0001;
const DEFAULT_ATTACK_SECONDS = 0.005;
const NOISE_BUFFER_SECONDS = 1;
const STOP_MARGIN_SECONDS = 0.02;

export interface ToneSpec {
  readonly waveform: OscillatorType;
  readonly frequency: number;
  /** Se informado, a altura desliza até este valor ao longo da nota. */
  readonly endFrequency?: number;
  readonly delaySeconds?: number;
  readonly durationSeconds: number;
  readonly gain: number;
  readonly attackSeconds?: number;
  /** Se informado, a nota se sustenta e some neste tempo final; sem ele, decai desde o ataque. */
  readonly releaseSeconds?: number;
}

export interface NoiseSpec {
  readonly filterType: BiquadFilterType;
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly delaySeconds?: number;
  /** No máximo 1 segundo. */
  readonly durationSeconds: number;
  readonly gain: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

export function scheduleTone(context: BaseAudioContext, destination: AudioNode, tone: ToneSpec, baseTime: number): void {
  const startTime = baseTime + (tone.delaySeconds ?? 0);
  const endTime = startTime + tone.durationSeconds;
  const oscillator = context.createOscillator();
  oscillator.type = tone.waveform;
  scheduleSweep(oscillator.frequency, tone.frequency, tone.endFrequency, startTime, endTime);

  const envelope = context.createGain();
  scheduleEnvelope(envelope.gain, tone, startTime, endTime);

  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + STOP_MARGIN_SECONDS);
}

export function scheduleNoise(context: BaseAudioContext, destination: AudioNode, noise: NoiseSpec, baseTime: number): void {
  const startTime = baseTime + (noise.delaySeconds ?? 0);
  const endTime = startTime + noise.durationSeconds;
  const source = context.createBufferSource();
  source.buffer = getNoiseBuffer(context);

  const filter = context.createBiquadFilter();
  filter.type = noise.filterType;
  scheduleSweep(filter.frequency, noise.frequency, noise.endFrequency, startTime, endTime);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(noise.gain, startTime);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, endTime);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);
  source.start(startTime);
  source.stop(endTime + STOP_MARGIN_SECONDS);
}

function scheduleSweep(parameter: AudioParam, from: number, to: number | undefined, startTime: number, endTime: number): void {
  parameter.setValueAtTime(from, startTime);
  if (to === undefined) {
    return;
  }
  parameter.exponentialRampToValueAtTime(to, endTime);
}

function scheduleEnvelope(gain: AudioParam, tone: ToneSpec, startTime: number, endTime: number): void {
  gain.setValueAtTime(SILENCE, startTime);
  gain.linearRampToValueAtTime(tone.gain, startTime + (tone.attackSeconds ?? DEFAULT_ATTACK_SECONDS));
  if (tone.releaseSeconds !== undefined) {
    gain.setValueAtTime(tone.gain, endTime - tone.releaseSeconds);
  }
  gain.exponentialRampToValueAtTime(SILENCE, endTime);
}

function getNoiseBuffer(context: BaseAudioContext): AudioBuffer {
  const cachedBuffer = noiseBuffers.get(context);
  if (cachedBuffer) {
    return cachedBuffer;
  }
  const length = Math.floor(context.sampleRate * NOISE_BUFFER_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) {
    samples[index] = Math.random() * 2 - 1;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}
