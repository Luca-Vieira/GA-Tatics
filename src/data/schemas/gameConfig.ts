import { z } from 'zod';
import { raritySchema } from './character';
import { synergyEffectSchema } from './synergy';

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

/** Bônus que uma torre no tabuleiro dá aos lutadores do mesmo time, calculado no começo do combate. */
export const towerBuffSchema = z.strictObject({
  /** Só quem estiver a até esta distância (em casas) da torre; sem o campo, o time inteiro. */
  radius: z.number().int().min(1).max(12).optional(),
  /** Mesmos efeitos das sinergias. */
  effect: synergyEffectSchema,
});

/** O que cada tipo de torre define. */
const towerPropertiesShape = {
  cost: positiveInteger,
  /** Vida na escala de atributos (1 a 10), como a dos personagens. */
  health: z.number().min(1).max(10),
  /** Moedas extras no início de cada rodada, por torre viva no tabuleiro. */
  incomePerRound: nonNegativeInteger,
  /** Moedas pagas uma vez, no início da rodada seguinte, a quem teve uma torre destruída. */
  compensationOnLoss: nonNegativeInteger.default(2),
  buffs: z.array(towerBuffSchema).max(4).default([]),
  /** Texto de apresentação; as regras e os bônus são descritos sozinhos. */
  description: z.string().min(1).max(160).optional(),
  /** Cor do desenho provisório (sem sprite). */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
};

/** Torre personalizada, criada no painel: aparece na loja junto da torre básica enquanto estiver ativa. */
export const towerVariantSchema = z.strictObject({
  id: z.string().regex(/^torre_[a-z0-9_]{1,30}$/, 'O id da torre começa com "torre_" e usa letras minúsculas, números e "_".'),
  name: z.string().min(1).max(30),
  active: z.boolean().default(true),
  ...towerPropertiesShape,
});

/**
 * Torre: estrutura comprada na loja que rende moedas enquanto está de pé no tabuleiro e some para sempre se for
 * destruída. Os campos soltos descrevem a torre básica; `variants` são as torres personalizadas.
 */
export const towerConfigSchema = z
  .strictObject({
    ...towerPropertiesShape,
    /** Chance (0 a 100) de cada vaga sorteada da loja virar uma torre. */
    offerChancePercent: z.number().min(0).max(100),
    /** Quantas torres (de qualquer tipo) uma pessoa pode ter ao mesmo tempo, no tabuleiro e na reserva. */
    maximumOwned: nonNegativeInteger,
    variants: z.array(towerVariantSchema).max(8).default([]),
  })
  .superRefine((tower, context) => {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>(['torre']);
    tower.variants.forEach((variant, position) => {
      const name = variant.name.trim().toLowerCase();
      if (seenIds.has(variant.id)) {
        context.addIssue({ code: 'custom', path: ['variants', position, 'id'], message: `Id de torre repetido: ${variant.id}` });
      }
      if (seenNames.has(name)) {
        context.addIssue({ code: 'custom', path: ['variants', position, 'name'], message: `Já existe uma torre chamada "${variant.name}".` });
      }
      seenIds.add(variant.id);
      seenNames.add(name);
    });
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
export type TowerVariant = z.infer<typeof towerVariantSchema>;
export type TowerBuff = z.infer<typeof towerBuffSchema>;
export type GameConfig = z.infer<typeof gameConfigSchema>;
export type { Rarity } from './character';
export { raritySchema };
