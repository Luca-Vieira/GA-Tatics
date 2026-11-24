import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { runBatch } from './batch';

const options = { characters: DEFAULT_CHARACTERS, matches: 60, unitsPerSide: 4, seedBase: 100 };

describe('runBatch', () => {
  const report = runBatch(options);

  it('é reproduzível', () => {
    expect(runBatch(options)).toEqual(report);
  });

  it('conta todas as unidades sorteadas: 60 combates × 2 lados × 4 unidades', () => {
    expect(report.characters.reduce((total, character) => total + character.appearances, 0)).toBe(60 * 2 * 4);
  });

  it('inclui os 13 personagens (12 da loja + Derson) e proporções entre 0 e 1', () => {
    expect(report.characters).toHaveLength(13);
    for (const character of report.characters) {
      expect(character.winRate).toBeGreaterThanOrEqual(0);
      expect(character.winRate).toBeLessThanOrEqual(1);
      expect(character.survivalRate).toBeGreaterThanOrEqual(0);
      expect(character.survivalRate).toBeLessThanOrEqual(1);
    }
    expect(report.averageDurationSeconds).toBeGreaterThan(0);
    expect(report.averageDurationSeconds).toBeLessThanOrEqual(30);
  });

  it('o personagem sem habilidade ativa (Vinícius, Moço) não registra usos', () => {
    for (const id of ['vinicius', 'moco']) {
      expect(report.characters.find((character) => character.characterId === id)!.abilityCastsPerAppearance).toBe(0);
    }
  });
});
