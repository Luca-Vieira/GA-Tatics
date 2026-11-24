import { describe, it } from 'vitest';
import { runBatch } from '@combat/simulation/batch';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { CHARACTER_WIN_RATE_LARGE_TEAMS, CHARACTER_WIN_RATE_SMALL_TEAMS, expectHealthyCombatShape, expectWinRatesWithin, LONG_TEST_TIMEOUT_MS } from './balanceBands';

describe('balanceamento em outros tamanhos de time', () => {
  it('times de 7 unidades (fim de partida)', () => {
    const report = runBatch({ characters: DEFAULT_CHARACTERS, matches: 2500, unitsPerSide: 7, seedBase: 77 });
    expectWinRatesWithin(report, CHARACTER_WIN_RATE_LARGE_TEAMS);
    expectHealthyCombatShape(report);
  }, LONG_TEST_TIMEOUT_MS);

  it('times de 3 unidades (início de partida)', () => {
    const report = runBatch({ characters: DEFAULT_CHARACTERS, matches: 3000, unitsPerSide: 3, seedBase: 88 });
    expectWinRatesWithin(report, CHARACTER_WIN_RATE_SMALL_TEAMS);
  }, LONG_TEST_TIMEOUT_MS);
});
