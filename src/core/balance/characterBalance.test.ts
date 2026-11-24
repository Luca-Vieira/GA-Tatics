import { beforeAll, describe, expect, it } from 'vitest';
import { runBatch, type BatchReport } from '@combat/simulation/batch';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { CHARACTER_WIN_RATE, expectHealthyCombatShape, expectWithin, expectWinRatesWithin, LONG_TEST_TIMEOUT_MS, SIDE_A_WIN_RATE } from './balanceBands';

describe('balanceamento dos personagens (times de 5 unidades)', () => {
  let report: BatchReport;
  beforeAll(() => {
    report = runBatch({ characters: DEFAULT_CHARACTERS, matches: 5000, unitsPerSide: 5, seedBase: 31 });
  }, LONG_TEST_TIMEOUT_MS);

  it('ninguém é forte nem fraco demais', () => {
    expectWinRatesWithin(report, CHARACTER_WIN_RATE);
  });

  it('os combates duram o que o design espera e quase nunca estouram o tempo limite', () => {
    expectHealthyCombatShape(report);
  });

  it('os dois lados do tabuleiro são equivalentes', () => {
    expectWithin(report.winRateOfSideA, SIDE_A_WIN_RATE, 'vitórias do lado A');
  });

  it('toda habilidade ativa é usada: nenhuma fica morta por condição impossível', () => {
    for (const character of report.characters) {
      const definition = DEFAULT_CHARACTERS.find((candidate) => candidate.id === character.characterId)!;
      if (definition.ability.activation.type === 'passive') continue;
      expect(character.abilityCastsPerAppearance, character.name).toBeGreaterThan(0.3);
    }
  });
});
