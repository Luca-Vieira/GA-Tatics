import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { INITIAL_SYNERGY_MAPPING } from '@data/defaults/synergies';
import { runGameBatch, type GameBatchReport } from '../game/gameBatch';
import { expectWithin, LONG_TEST_TIMEOUT_MS, type Band } from './balanceBands';

/** GDD: partidas de 6 a 10 minutos. */
const ESTIMATED_MINUTES: Band = { minimum: 6, maximum: 10 };
const AVERAGE_ROUNDS: Band = { minimum: 5, maximum: 10 };
/** Com 4 lugares o equilíbrio é 25%; a margem cobre o acaso da amostra. */
const SEAT_WIN_SHARE: Band = { minimum: 0.12, maximum: 0.4 };

describe('balanceamento das partidas completas (4 bots)', () => {
  let report: GameBatchReport;
  beforeAll(() => {
    report = runGameBatch({ games: 300, seedBase: 5, roster: DEFAULT_CHARACTERS, synergyMapping: INITIAL_SYNERGY_MAPPING });
  }, LONG_TEST_TIMEOUT_MS);

  it('nenhuma partida trava', () => {
    expect(report.stalledGames).toBe(0);
    expect(report.maximumRounds).toBeLessThan(15);
  });

  it('a partida dura o que o GDD pede', () => {
    expectWithin(report.averageRounds, AVERAGE_ROUNDS, 'rodadas por partida');
    expect(report.estimatedMinutes, 'minutos estimados').toBeGreaterThanOrEqual(ESTIMATED_MINUTES.minimum);
    expect(report.estimatedMinutes, 'minutos estimados').toBeLessThanOrEqual(ESTIMATED_MINUTES.maximum);
  });

  it('nenhum lugar da mesa ganha demais ou de menos', () => {
    for (const [seat, share] of Object.entries(report.winShareBySeat)) {
      expectWithin(share, SEAT_WIN_SHARE, `lugar ${seat}`);
    }
  });
});
