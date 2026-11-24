/**
 * Faixas-alvo do balanceamento (decisoes-de-design.md, Seção 13). Se um teste de balanceamento quebrar depois de mexer
 * num personagem ou numa sinergia, o número saiu da faixa: ajuste o dado, não a faixa, a menos que o design tenha mudado.
 */
import { expect } from 'vitest';
import type { BatchReport } from '@combat/simulation/batch';

export interface Band {
  readonly minimum: number;
  readonly maximum: number;
}

/** Vitórias aceitas para qualquer personagem (50% é o equilíbrio perfeito). */
export const CHARACTER_WIN_RATE: Band = { minimum: 0.42, maximum: 0.58 };
export const CHARACTER_WIN_RATE_LARGE_TEAMS: Band = { minimum: 0.4, maximum: 0.6 };
export const CHARACTER_WIN_RATE_SMALL_TEAMS: Band = { minimum: 0.38, maximum: 0.62 };
export const AVERAGE_COMBAT_SECONDS: Band = { minimum: 15, maximum: 25 };
export const SIDE_A_WIN_RATE: Band = { minimum: 0.46, maximum: 0.54 };
export const FIRST_TIER_WIN_RATE: Band = { minimum: 0.54, maximum: 0.63 };
export const SECOND_TIER_WIN_RATE: Band = { minimum: 0.6, maximum: 0.72 };
export const MAXIMUM_TIMEOUT_RATE = 0.12;
export const MAXIMUM_DRAW_RATE = 0.02;

/** Tempo máximo de uma suíte que roda milhares de combates. */
export const LONG_TEST_TIMEOUT_MS = 240_000;

export function expectWithin(value: number, band: Band, label: string): void {
  const message = `${label}: ${value.toFixed(3)} (faixa ${band.minimum}–${band.maximum})`;
  expect(value, message).toBeGreaterThanOrEqual(band.minimum);
  expect(value, message).toBeLessThanOrEqual(band.maximum);
}

export function expectWinRatesWithin(report: BatchReport, band: Band): void {
  for (const character of report.characters) {
    expectWithin(character.winRate, band, character.name);
  }
}

export function expectHealthyCombatShape(report: BatchReport): void {
  expect(report.averageDurationSeconds, 'duração média (s)').toBeGreaterThanOrEqual(AVERAGE_COMBAT_SECONDS.minimum);
  expect(report.averageDurationSeconds, 'duração média (s)').toBeLessThanOrEqual(AVERAGE_COMBAT_SECONDS.maximum);
  expect(report.timeoutRate, 'combates que estouram o tempo').toBeLessThanOrEqual(MAXIMUM_TIMEOUT_RATE);
  expect(report.drawRate, 'empates').toBeLessThanOrEqual(MAXIMUM_DRAW_RATE);
}
