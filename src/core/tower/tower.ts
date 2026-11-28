import { characterSchema, type CharacterDefinition } from '@data/schemas/character';
import type { TowerBuff, TowerConfig } from '@data/schemas/gameConfig';
import { describeSynergyEffect } from '../synergies/describe';
import { boardUnitsOf, type OwnedUnit, type PlayerState } from '../players/playerState';

/** Id da torre básica, usado no lugar do id de um personagem. As personalizadas usam "torre_...". */
export const TOWER_ID = 'torre';
const TOWER_NAME = 'Torre';
const TOWER_COLOR = '#fbbf24';

export function isTowerId(characterId: string): boolean {
  return characterId === TOWER_ID || characterId.startsWith(`${TOWER_ID}_`);
}

/** Um tipo de torre já resolvido: a básica ou uma personalizada. */
export interface TowerDefinition {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly cost: number;
  readonly health: number;
  readonly incomePerRound: number;
  readonly compensationOnLoss: number;
  readonly buffs: readonly TowerBuff[];
  readonly description?: string;
  readonly color: string;
}

/** Todos os tipos de torre do conteúdo, a básica primeiro (inclusive as desativadas). */
export function towerDefinitionsOf(config: TowerConfig): TowerDefinition[] {
  const { cost, health, incomePerRound, compensationOnLoss, buffs, description, color = TOWER_COLOR } = config;
  return [
    { id: TOWER_ID, name: TOWER_NAME, active: true, cost, health, incomePerRound, compensationOnLoss, buffs, description, color },
    ...config.variants.map((variant) => ({ ...variant, color: variant.color ?? TOWER_COLOR })),
  ];
}

/** Os tipos que a loja pode oferecer. */
export function offeredTowersOf(config: TowerConfig): TowerDefinition[] {
  return towerDefinitionsOf(config).filter((tower) => tower.active);
}

export function towerDefinitionOf(config: TowerConfig, towerId: string): TowerDefinition {
  const tower = towerDefinitionsOf(config).find((candidate) => candidate.id === towerId);
  if (!tower) {
    throw new Error(`Torre desconhecida: ${towerId}`);
  }
  return tower;
}

export function countOwnedTowers(player: PlayerState): number {
  return player.units.filter((unit) => isTowerId(unit.characterId)).length;
}

/** Unidades do tabuleiro que contam no limite da rodada: todas, menos as torres (que não ocupam vaga de lutador). */
export function boardFightersOf(player: PlayerState): OwnedUnit[] {
  return boardUnitsOf(player).filter((unit) => !isTowerId(unit.characterId));
}

/** Moedas extras do início da rodada: cada torre que está no tabuleiro (e não foi destruída) rende a renda do tipo dela. */
export function towerIncomeOf(player: PlayerState, config: TowerConfig): number {
  return boardUnitsOf(player)
    .filter((unit) => isTowerId(unit.characterId))
    .reduce((total, unit) => total + towerDefinitionOf(config, unit.characterId).incomePerRound, 0);
}

/** "+12% de velocidade de ataque (aliados a até 2 casas)". */
export function describeTowerBuff(buff: TowerBuff): string {
  const reach = buff.radius === undefined ? 'time inteiro' : `aliados a até ${buff.radius} ${buff.radius === 1 ? 'casa' : 'casas'}`;
  return `${describeSynergyEffect(buff.effect)} (${reach})`;
}

const coinsText = (amount: number) => `${amount} ${amount === 1 ? 'moeda' : 'moedas'}`;

function towerRulesText(tower: TowerDefinition): string {
  const sentences = [
    'Não ocupa vaga no limite de unidades.',
    ...(tower.buffs.length > 0 ? [`Bônus no combate: ${tower.buffs.map(describeTowerBuff).join('; ')}. Conta a posição no começo da luta.`] : []),
    ...(tower.incomePerRound > 0 ? [`Rende +${coinsText(tower.incomePerRound)} por rodada enquanto estiver no tabuleiro e de pé.`] : []),
    'Os inimigos só miram nela quando não sobra ninguém do seu time (golpes em área a acertam antes disso): proteja o time.',
    tower.compensationOnLoss > 0
      ? `Se for destruída, some para sempre, mas você recebe +${coinsText(tower.compensationOnLoss)} (uma única vez) no início da rodada seguinte.`
      : 'Se for destruída, some para sempre.',
  ];
  return sentences.join(' ');
}

/**
 * Definição "de personagem" de uma torre, só para a interface e o combate tratarem a torre como qualquer carta
 * (nome, vida, texto). Ela não faz parte do elenco: não tem sinergia, não funde e não ataca.
 */
export function buildTowerCharacter(tower: TowerDefinition): CharacterDefinition {
  return characterSchema.parse({
    id: tower.id,
    name: tower.name,
    archetype: 'Estrutura',
    description: tower.description ?? 'Construção do seu time.',
    category: 'structure',
    rarity: 'special',
    stats: { health: tower.health, damage: 1, attackSpeed: 1, range: 1, mobility: 1 },
    behavior: { movement: 'chase', targetPriority: 'nearest', preferredDistance: 1 },
    ability: {
      id: 'tower_income',
      name: tower.buffs.length > 0 ? 'Apoio' : 'Renda',
      description: towerRulesText(tower),
      activation: { type: 'passive' },
      cooldownSeconds: 0,
      // A torre não age em combate; este efeito existe só porque toda habilidade precisa de ao menos um.
      effects: [{ type: 'status', targets: 'self', status: 'damage_reduction', value: 0.01, durationSeconds: 1 }],
      visual: { kind: 'none', color: tower.color },
    },
  });
}

/** As definições "de personagem" de todos os tipos, para a partida e o cliente consultarem pelo id. */
export function buildTowerCharacters(config: TowerConfig): CharacterDefinition[] {
  return towerDefinitionsOf(config).map(buildTowerCharacter);
}
