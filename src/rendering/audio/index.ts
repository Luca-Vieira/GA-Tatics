/** Áudio do jogo: música e efeitos sintetizados com a Web Audio API, sem arquivos de som. */
import { mountAudioControlsFor } from './audioControls';
import { AudioEngine } from './audioEngine';
import { createBrowserEnvironment } from './browserEnvironment';
import type { GameAudio } from './types';

export type { AudioSettings, GameAudio, MusicMood, SoundEffect } from './types';

export const gameAudio: GameAudio = new AudioEngine(createBrowserEnvironment());

/** Botão de som no canto da tela. Chamar de novo não duplica; a função devolvida remove tudo. */
export function mountAudioControls(): () => void {
  return mountAudioControlsFor(gameAudio);
}
