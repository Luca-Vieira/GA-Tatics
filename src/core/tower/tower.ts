import { characterSchema, type CharacterDefinition } from '@data/schemas/character';
import type { TowerConfig } from '@data/schemas/gameConfig';
import { boardUnitsOf, type PlayerState } from '../players/playerState';

/** Id usado pela torre no lugar do id de um personagem (oferta da loja, unidade do jogador, unidade do combate). */
export const TOWER_ID = 'torre';

export function isTowerId(characterId: string): boolean {
  return characterId === TOWER_ID;
}

export function countOwnedTowers(player: PlayerState): number {
  return player.units.filter((unit) => isTowerId(unit.characterId)).length;
}

/** Moedas extras do início da rodada: cada torre que está no tabuleiro (e não foi destruída) rende `incomePerRound`. */
export function towerIncomeOf(player: PlayerState, config: TowerConfig): number {
  return boardUnitsOf(player).filter((unit) => isTowerId(unit.characterId)).length * config.incomePerRound;
}

/**
 * Definição "de personagem" da torre, só para a interface e o combate tratarem a torre como qualquer carta
 * (nome, vida, texto). Ela não faz parte do elenco: não tem sinergia, não funde e não ataca.
 */
export function buildTowerCharacter(config: TowerConfig): CharacterDefinition {
  return characterSchema.parse({
    id: TOWER_ID,
    name: 'Torre',
    archetype: 'Estrutura',
    description: 'Construção que rende moedas.',
    category: 'structure',
    rarity: 'special',
    stats: { health: config.health, damage: 1, attackSpeed: 1, range: 1, mobility: 1 },
    behavior: { movement: 'chase', targetPriority: 'nearest', preferredDistance: 1 },
    ability: {
      id: 'tower_income',
      name: 'Renda',
      description: `Rende +${config.incomePerRound} moedas por rodada enquanto estiver no tabuleiro e de pé. Os inimigos podem atacá-la: proteja-a. Se for destruída, some para sempre, mas você recebe +${config.compensationOnLoss} moedas (uma única vez) no início da rodada seguinte.`,
      activation: { type: 'passive' },
      cooldownSeconds: 0,
      // A torre não age em combate; este efeito existe só porque toda habilidade precisa de ao menos um.
      effects: [{ type: 'status', targets: 'self', status: 'damage_reduction', value: 0.01, durationSeconds: 1 }],
      visual: { kind: 'none', color: '#fbbf24' },
    },
  });
}
