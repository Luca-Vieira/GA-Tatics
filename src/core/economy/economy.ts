import type { EconomyConfig } from '@data/schemas/gameConfig';
import { valueForRound } from '../rounds/rounds';

export function incomeForRound(config: EconomyConfig, round: number): number {
  return valueForRound(config.incomeByRound, round);
}

/** Uma moeda a cada `interestStep` guardadas, limitada por `interestCap` (GDD 2.4). */
export function interestOn(config: EconomyConfig, heldCoins: number): number {
  return Math.min(Math.floor(heldCoins / config.interestStep), config.interestCap);
}

/** Moedas ao início da rodada: as guardadas, mais juros sobre elas, mais a renda da tabela, até o teto. */
export function coinsAtRoundStart(config: EconomyConfig, heldCoins: number, round: number): number {
  const total = heldCoins + interestOn(config, heldCoins) + incomeForRound(config, round);
  return Math.min(total, config.coinCap);
}
