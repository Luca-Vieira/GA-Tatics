export type SoundEffect =
  // Combate
  | 'attack'
  | 'hit'
  | 'shot'
  | 'ranged_hit'
  | 'splash_hit'
  | 'ability_hit'
  | 'miss'
  | 'heal'
  | 'poison'
  | 'buff'
  | 'debuff'
  | 'summon'
  | 'trap'
  | 'terrain'
  | 'ability'
  | 'unit_death'
  | 'tower_destroyed'
  // Partida
  | 'combat_start'
  | 'countdown'
  | 'purchase'
  | 'sell'
  | 'refresh'
  | 'fusion'
  | 'error'
  | 'round_win'
  | 'round_loss'
  | 'match_win'
  | 'match_loss'
  | 'click';

/** Música de fundo: calma no saguão e na preparação, intensa durante a luta. */
export type MusicMood = 'calm' | 'combat';

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
  setMusicMood(mood: MusicMood): void;
  getSettings(): AudioSettings;
  updateSettings(changes: Partial<AudioSettings>): void;
}
