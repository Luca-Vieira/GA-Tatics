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
    refreshCost: 1,
    costByRarity: { common: 3, rare: 4, special: 4 },
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
    cost: 3,
    health: 4,
    incomePerRound: 2,
    // Por vaga: com 5 vagas, 6% mantém a chance de ver uma torre na loja perto da de antes (3 vagas a 10%).
    offerChancePercent: 6,
    maximumOwned: 2,
    compensationOnLoss: 2,
    // Exemplos prontos, desligados: o painel os ativa, edita ou apaga.
    variants: [
      {
        id: 'torre_cafe',
        name: 'Máquina de café',
        active: false,
        cost: 4,
        health: 3,
        incomePerRound: 1,
        compensationOnLoss: 2,
        color: '#b45309',
        description: 'Quem fica por perto trabalha acelerado.',
        buffs: [{ radius: 2, effect: { type: 'attribute_multiplier', attribute: 'attackSpeed', value: 1.12 } }],
      },
      {
        id: 'torre_enfermaria',
        name: 'Enfermaria',
        active: false,
        cost: 4,
        health: 5,
        incomePerRound: 0,
        compensationOnLoss: 2,
        color: '#16a34a',
        description: 'Cuida de quem está ao redor.',
        buffs: [
          { radius: 2, effect: { type: 'attribute_multiplier', attribute: 'health', value: 1.15 } },
          { radius: 2, effect: { type: 'hp_regen', value: 0.02, tickSeconds: 3 } },
        ],
      },
    ],
  },
});
