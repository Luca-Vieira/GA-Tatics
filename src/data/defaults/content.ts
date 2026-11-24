import { gameContentSchema, type GameContent } from '../schemas/content';
import { DEFAULT_CHARACTERS } from './characters';
import { DEFAULT_GAME_CONFIG } from './gameConfig';
import { DEFAULT_SYNERGIES, DEFAULT_SYNERGY_ROTATION, INITIAL_SYNERGY_MAPPING } from './synergies';

/** Conteúdo de lançamento: o que o servidor usa enquanto ninguém editou nada no painel de administração. */
export const DEFAULT_GAME_CONTENT: GameContent = gameContentSchema.parse({
  characters: DEFAULT_CHARACTERS,
  synergies: DEFAULT_SYNERGIES,
  config: DEFAULT_GAME_CONFIG,
  rotation: DEFAULT_SYNERGY_ROTATION,
  initialSynergyMapping: INITIAL_SYNERGY_MAPPING,
});
