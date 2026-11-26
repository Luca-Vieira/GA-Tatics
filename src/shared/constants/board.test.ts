import { describe, expect, it } from 'vitest';
import { hexDistance, hexesAreEqual, hexKey } from '../utils/hex';
import { BOARD_CELLS, cellsOfSide, cellsWithinRange, isInsideBoard, mirrorCell, sideOfCell } from './board';

describe('tabuleiro', () => {
  it('tem 60 casas distintas, 30 por lado', () => {
    expect(BOARD_CELLS).toHaveLength(60);
    expect(new Set(BOARD_CELLS.map(hexKey)).size).toBe(60);
    expect(cellsOfSide('A')).toHaveLength(30);
    expect(cellsOfSide('B')).toHaveLength(30);
  });

  it('reconhece casas de dentro e de fora', () => {
    expect(isInsideBoard(BOARD_CELLS[0]!)).toBe(true);
    expect(isInsideBoard({ q: 100, r: 100 })).toBe(false);
  });

  it('o espelho de cada casa existe, é do lado oposto e volta à casa original', () => {
    for (const cell of BOARD_CELLS) {
      const espelho = mirrorCell(cell);
      expect(isInsideBoard(espelho)).toBe(true);
      expect(sideOfCell(espelho)).not.toBe(sideOfCell(cell));
      expect(mirrorCell(espelho)).toEqual(cell);
    }
  });

  it('o espelho preserva distâncias (os dois lados são equivalentes)', () => {
    const primeira = BOARD_CELLS[3]!;
    const segunda = BOARD_CELLS[27]!;
    expect(hexDistance(mirrorCell(primeira), mirrorCell(segunda))).toBe(hexDistance(primeira, segunda));
  });

  it('é conexo: toda casa tem ao menos um vizinho dentro do tabuleiro', () => {
    for (const cell of BOARD_CELLS) {
      const vizinhosDentro = BOARD_CELLS.filter((outra) => hexDistance(cell, outra) === 1);
      expect(vizinhosDentro.length).toBeGreaterThan(0);
    }
  });

  it('o alcance cobre as casas a até N passos, sem a própria casa e sem sair do tabuleiro', () => {
    const centro = BOARD_CELLS[17]!;
    const alcance1 = cellsWithinRange(centro, 1);
    expect(alcance1.length).toBeGreaterThan(0);
    expect(alcance1.length).toBeLessThanOrEqual(6);
    expect(alcance1.every((cell) => hexDistance(centro, cell) === 1)).toBe(true);
    const alcance3 = cellsWithinRange(centro, 3);
    expect(alcance3.every((cell) => isInsideBoard(cell) && hexDistance(centro, cell) <= 3)).toBe(true);
    expect(alcance3.some((cell) => hexesAreEqual(cell, centro))).toBe(false);
    expect(alcance3.length).toBeGreaterThan(alcance1.length);
    expect(cellsWithinRange(centro, 0)).toEqual([]);
  });
});
