import { z } from 'zod';
import { raritySchema } from './character';

const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().min(0);

/** Valor da tabela para a rodada informada; a última entrada vale para todas as rodadas seguintes ("5+"). */
const perRoundTableSchema = z.array(z.number().int().min(0)).min(1);

export const economyConfigSchema = z.strictObject({
  startingCoins: nonNegativeInteger,
  /** Moedas recebidas por rodada (índice 0 = rodada 1). */
  incomeByRound: perRoundTableSchema,
  coinCap: positiveInteger,
  /** Uma moeda extra a cada `interestStep` guardadas, até `interestCap` moedas por rodada. */
  interestStep: positiveInteger,
  interestCap: nonNegativeInteger,
});

export const shopConfigSchema = z.strictObject({
  offerSize: positiveInteger,
  refreshCost: nonNegativeInteger,
  costByRarity: z.strictObject({ common: positiveInteger, rare: positiveInteger, special: positiveInteger }),
  rarityWeights: z.strictObject({ common: z.number().min(0), rare: z.number().min(0), special: z.number().min(0) }),
  /** Valor de venda por estrela (índice 0 = 1 estrela). */
  sellValueByStar: z.tuple([nonNegativeInteger, nonNegativeInteger, nonNegativeInteger]),
});

export const roundsConfigSchema = z.strictObject({
  startingLives: positiveInteger,
  /** Unidades permitidas no tabuleiro por rodada (índice 0 = rodada 1). */
  unitLimitByRound: perRoundTableSchema,
  benchSize: positiveInteger,
  preparationSeconds: positiveInteger,
  /** A partir desta rodada a preparação passa a durar `shortPreparationSeconds`. */
  shortPreparationFromRound: positiveInteger,
  shortPreparationSeconds: positiveInteger,
  resultSeconds: positiveInteger,
  /** A partir desta rodada, perder um combate custa `overtimeLivesLost` vidas ("horas extras"). */
  overtimeFromRound: positiveInteger,
  overtimeLivesLost: positiveInteger,
});

/** Torre: estrutura comprada na loja que rende moedas enquanto está de pé no tabuleiro e some para sempre se for destruída. */
export const towerConfigSchema = z.strictObject({
  cost: positiveInteger,
  /** Vida na escala de atributos (1 a 10), como a dos personagens. */
  health: z.number().min(1).max(10),
  /** Moedas extras no início de cada rodada, por torre viva no tabuleiro. */
  incomePerRound: nonNegativeInteger,
  /** Chance (0 a 100) de cada vaga sorteada da loja virar uma torre. */
  offerChancePercent: z.number().min(0).max(100),
  /** Quantas torres uma pessoa pode ter ao mesmo tempo (no tabuleiro e na reserva). */
  maximumOwned: nonNegativeInteger,
});

export const gameConfigSchema = z.strictObject({
  economy: economyConfigSchema,
  shop: shopConfigSchema,
  rounds: roundsConfigSchema,
  tower: towerConfigSchema,
});

export type EconomyConfig = z.infer<typeof economyConfigSchema>;
export type ShopConfig = z.infer<typeof shopConfigSchema>;
export type RoundsConfig = z.infer<typeof roundsConfigSchema>;
export type TowerConfig = z.infer<typeof towerConfigSchema>;
export type GameConfig = z.infer<typeof gameConfigSchema>;
export type { Rarity } from './character';
export { raritySchema };
