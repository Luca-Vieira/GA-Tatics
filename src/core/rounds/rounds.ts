import type { RoundsConfig } from '@data/schemas/gameConfig';

/** Valor da tabela para a rodada informada; depois da última entrada, vale a última ("5+"). */
export function valueForRound(table: readonly number[], round: number): number {
  const position = Math.min(Math.max(round, 1), table.length) - 1;
  return table[position] as number;
}

export function unitLimitForRound(config: RoundsConfig, round: number): number {
  return valueForRound(config.unitLimitByRound, round);
}

/** A preparação encurta nas rodadas finais para a partida não se arrastar. */
export function preparationSecondsForRound(config: RoundsConfig, round: number): number {
  return round >= config.shortPreparationFromRound ? config.shortPreparationSeconds : config.preparationSeconds;
}

/** Vidas perdidas por quem perde o combate; nas "horas extras" a derrota custa mais. */
export function livesLostOnDefeat(config: RoundsConfig, round: number): number {
  return round >= config.overtimeFromRound ? config.overtimeLivesLost : 1;
}
