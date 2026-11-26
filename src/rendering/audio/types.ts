export type SoundEffect =
  | 'attack'
  | 'ability'
  | 'purchase'
  | 'sell'
  | 'refresh'
  | 'tower_destroyed'
  | 'unit_death'
  | 'round_win'
  | 'round_loss'
  | 'click';

export interface AudioSettings {
  readonly musicEnabled: boolean;
  readonly effectsEnabled: boolean;
  /** De 0 a 1. */
  readonly musicVolume: number;
  /** De 0 a 1. */
  readonly effectsVolume: number;
}

export interface GameAudio {
  play(effect: SoundEffect): void;
  startMusic(): void;
  stopMusic(): void;
  getSettings(): AudioSettings;
  updateSettings(changes: Partial<AudioSettings>): void;
}
