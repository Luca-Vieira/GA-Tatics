import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, isInsideBoard } from '@shared/constants/board';
import { hexDistance, hexKey, hexesAreEqual, offsetToAxial, type Hex } from '@shared/utils/hex';
import { findShortestPath } from './bfs';

const cellAt = (column: number, row: number): Hex => offsetToAxial({ column, row });

describe('findShortestPath', () => {
  it('devolve lista vazia quando o início já é um destino', () => {
    const start = cellAt(2, 2);
    expect(findShortestPath(start, { isWalkable: isInsideBoard, isGoal: () => true })).toEqual([]);
  });

  it('encontra o caminho mais curto em tabuleiro livre', () => {
    const start = cellAt(0, 0);
    const goal = cellAt(4, 7);
    const path = findShortestPath(start, { isWalkable: isInsideBoard, isGoal: (cell) => hexesAreEqual(cell, goal) });
    expect(path).not.toBeNull();
    expect(path).toHaveLength(hexDistance(start, goal));
    expect(hexesAreEqual(path![path!.length - 1]!, goal)).toBe(true);
  });

  it('só dá passos entre casas vizinhas', () => {
    const start = cellAt(0, 0);
    const goal = cellAt(4, 7);
    const path = findShortestPath(start, { isWalkable: isInsideBoard, isGoal: (cell) => hexesAreEqual(cell, goal) })!;
    const route = [start, ...path];
    for (let step = 1; step < route.length; step++) {
      expect(hexDistance(route[step - 1]!, route[step]!)).toBe(1);
    }
  });

  it('contorna casas bloqueadas', () => {
    const start = cellAt(0, 0);
    const goal = cellAt(4, 0);
    const blockedKeys = new Set([cellAt(1, 0), cellAt(2, 0), cellAt(3, 0)].map(hexKey));
    const path = findShortestPath(start, {
      isWalkable: (cell) => isInsideBoard(cell) && !blockedKeys.has(hexKey(cell)),
      isGoal: (cell) => hexesAreEqual(cell, goal),
    });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(4);
    expect(path!.some((cell) => blockedKeys.has(hexKey(cell)))).toBe(false);
  });

  it('devolve null quando nenhum destino é alcançável', () => {
    const start = cellAt(0, 0);
    const wallRowKeys = new Set(BOARD_CELLS.filter((cell) => cell.r === 3).map(hexKey));
    const path = findShortestPath(start, {
      isWalkable: (cell) => isInsideBoard(cell) && !wallRowKeys.has(hexKey(cell)),
      isGoal: (cell) => cell.r === 6,
    });
    expect(path).toBeNull();
  });

  it('é determinística: o mesmo problema dá sempre o mesmo caminho', () => {
    const rules = { isWalkable: isInsideBoard, isGoal: (cell: Hex) => cell.r === 7 };
    expect(findShortestPath(cellAt(2, 0), rules)).toEqual(findShortestPath(cellAt(2, 0), rules));
  });
});
