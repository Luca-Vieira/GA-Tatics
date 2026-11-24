import { describe, expect, it } from 'vitest';
import { runBatch } from '@combat/simulation/batch';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { DEFAULT_SYNERGIES } from '@data/defaults/synergies';
import { bonusesOfSingleTier } from '../synergies/synergies';
import { expectWithin, FIRST_TIER_WIN_RATE, LONG_TEST_TIMEOUT_MS, SECOND_TIER_WIN_RATE } from './balanceBands';

/** O bônus vale para o time inteiro do lado A, que enfrenta um time sem bônus: mede a força do nível sozinho. */
function winRateWithTier(synergyIndex: number, tierIndex: number): number {
  const synergy = DEFAULT_SYNERGIES[synergyIndex]!;
  const bonuses = bonusesOfSingleTier(synergy, tierIndex);
  return runBatch({ characters: DEFAULT_CHARACTERS, matches: 1200, unitsPerSide: 5, seedBase: 21, bonusesBySide: { A: bonuses } }).winRateOfSideA;
}

describe.each(DEFAULT_SYNERGIES.map((synergy, index) => ({ name: synergy.name, index })))('peso dos níveis de $name', ({ index }) => {
  it('o nível 1 dá vantagem moderada, e o nível 2 é mais forte sem decidir o combate sozinho', () => {
    const firstTier = winRateWithTier(index, 0);
    const secondTier = winRateWithTier(index, 1);
    expectWithin(firstTier, FIRST_TIER_WIN_RATE, 'nível 1');
    expectWithin(secondTier, SECOND_TIER_WIN_RATE, 'nível 2');
    expect(secondTier).toBeGreaterThan(firstTier);
  }, LONG_TEST_TIMEOUT_MS);
});
