import { gameConfigSchema, type GameConfig } from '../schemas/gameConfig';

/** Valores iniciais do GDD e de decisoes-de-design.md; todos provisórios, a serem ajustados no balanceamento. */
export const DEFAULT_GAME_CONFIG: GameConfig = gameConfigSchema.parse({
  economy: {
    startingCoins: 0,
    incomeByRound: [5, 5, 6, 6, 7],
    coinCap: 10,
    interestStep: 5,
    interestCap: 2,
  },
  shop: {
    offerSize: 5,
    refreshCost: 2,
    costByRarity: { common: 3, rare: 4, special: 5 },
    rarityWeights: { common: 70, rare: 25, special: 5 },
    sellValueByStar: [1, 3, 8],
  },
  rounds: {
    startingLives: 3,
    unitLimitByRound: [3, 4, 5, 6, 7],
    benchSize: 6,
    preparationSeconds: 40,
    shortPreparationFromRound: 6,
    shortPreparationSeconds: 30,
    resultSeconds: 5,
    overtimeFromRound: 10,
    overtimeLivesLost: 2,
  },
  tower: {
    cost: 5,
    health: 4,
    incomePerRound: 2,
    // Por vaga: com 5 vagas, 6% mantém a chance de ver uma torre na loja perto da de antes (3 vagas a 10%).
    offerChancePercent: 6,
    maximumOwned: 2,
    compensationOnLoss: 2,
  },
});
