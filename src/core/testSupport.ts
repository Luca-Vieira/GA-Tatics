import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { DEFAULT_GAME_CONFIG } from '@data/defaults/gameConfig';
import { INITIAL_SYNERGY_MAPPING } from '@data/defaults/synergies';
import { offsetToAxial, type Hex } from '@shared/utils/hex';
import { SeededRandom } from '@shared/utils/random';
import { Game, type GameOptions } from './game/Game';
import type { ActionContext } from './players/playerActions';
import { createPlayerState, type OwnedUnit, type PlayerState, type UnitLocation } from './players/playerState';

/** Apoio compartilhado pelos testes do núcleo do jogo. */
export const cellAt = (column: number, row: number): Hex => offsetToAxial({ column, row });

export function makePlayer(id = 'p1'): PlayerState {
  return createPlayerState({ id, name: id, isBot: false }, DEFAULT_GAME_CONFIG.rounds.startingLives, 0);
}

export function makeContext(round = 1, seed = 'teste'): ActionContext {
  return { config: DEFAULT_GAME_CONFIG, round, roster: DEFAULT_CHARACTERS, shopRandom: new SeededRandom(seed) };
}

/** Dá uma unidade diretamente ao jogador, sem passar pela loja. */
export function giveUnit(player: PlayerState, characterId: string, location: UnitLocation, starLevel: 1 | 2 | 3 = 1): OwnedUnit {
  const serial = ++player.unitSerial;
  const unit: OwnedUnit = { id: `${player.id}-u${serial}`, characterId, starLevel, acquiredOrder: serial, location };
  player.units.push(unit);
  return unit;
}

export function offerShop(player: PlayerState, ...characterIds: string[]): void {
  player.shop = characterIds.map((characterId) => {
    const character = DEFAULT_CHARACTERS.find((candidate) => candidate.id === characterId);
    if (!character) throw new Error(`Personagem inexistente: ${characterId}`);
    return { characterId, cost: DEFAULT_GAME_CONFIG.shop.costByRarity[character.rarity] };
  });
}

export function makeGame(overrides: Partial<GameOptions> = {}): Game {
  return new Game({
    seed: 'partida-teste',
    roster: DEFAULT_CHARACTERS,
    players: [
      { id: 'p1', name: 'Jogador 1', isBot: true },
      { id: 'p2', name: 'Jogador 2', isBot: true },
      { id: 'p3', name: 'Jogador 3', isBot: true },
      { id: 'p4', name: 'Jogador 4', isBot: true },
    ],
    synergyMapping: INITIAL_SYNERGY_MAPPING,
    rotationIndex: 0,
    ...overrides,
  });
}
