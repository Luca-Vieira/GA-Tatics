import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '@data/defaults/gameConfig';
import { coinsAtRoundStart, incomeForRound, interestOn } from './economy';

const economy = DEFAULT_GAME_CONFIG.economy;

describe('economia', () => {
  it('a renda segue a tabela do GDD e a última linha vale dali em diante', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((round) => incomeForRound(economy, round))).toEqual([5, 5, 6, 6, 7, 7, 7]);
  });

  it('juros: uma moeda a cada cinco guardadas, no máximo duas', () => {
    expect([0, 4, 5, 9, 10, 14, 15, 30].map((coins) => interestOn(economy, coins))).toEqual([0, 0, 1, 1, 2, 2, 2, 2]);
  });

  it('a rodada 1 começa com as 5 moedas da tabela', () => {
    expect(coinsAtRoundStart(economy, 0, 1)).toBe(5);
  });

  it('soma moedas guardadas, juros e renda', () => {
    expect(coinsAtRoundStart(economy, 0, 2)).toBe(5);
    expect(coinsAtRoundStart(economy, 3, 2)).toBe(3 + 0 + 5);
    expect(coinsAtRoundStart(economy, 4, 3)).toBe(4 + 0 + 6);
  });

  it('nunca passa do limite de 10 moedas', () => {
    expect(coinsAtRoundStart(economy, 9, 5)).toBe(10);
    expect(coinsAtRoundStart(economy, 10, 1)).toBe(10);
  });
});
