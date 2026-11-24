import { axialToOffset, hexDistance, hexKey, offsetToAxial, type Hex } from '../utils/hex';

/**
 * Tabuleiro: 8 linhas x 5 colunas = 40 casas, 20 por jogador (decisão registrada em decisoes-de-design.md).
 * Linhas 0 a 3 pertencem ao lado A; linhas 4 a 7 ao lado B.
 */
export const BOARD_ROWS = 8;
export const BOARD_COLUMNS = 5;
export const ROWS_PER_SIDE = BOARD_ROWS / 2;

export type BoardSide = 'A' | 'B';

export const BOARD_CELLS: readonly Hex[] = createBoardCells();

const BOARD_CELL_KEYS: ReadonlySet<string> = new Set(BOARD_CELLS.map(hexKey));

function createBoardCells(): Hex[] {
  const cells: Hex[] = [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let column = 0; column < BOARD_COLUMNS; column++) {
      cells.push(offsetToAxial({ column, row }));
    }
  }
  return cells;
}

export function isInsideBoard(hex: Hex): boolean {
  return BOARD_CELL_KEYS.has(hexKey(hex));
}

/** Lado dono da casa. Quem chama deve garantir que a casa pertence ao tabuleiro. */
export function sideOfCell(hex: Hex): BoardSide {
  return axialToOffset(hex).row < ROWS_PER_SIDE ? 'A' : 'B';
}

export function cellsOfSide(side: BoardSide): Hex[] {
  return BOARD_CELLS.filter((cell) => sideOfCell(cell) === side);
}

/** Casa equivalente do lado oposto (rotação de 180° do tabuleiro). */
export function mirrorCell(hex: Hex): Hex {
  const { column, row } = axialToOffset(hex);
  return offsetToAxial({ column: BOARD_COLUMNS - 1 - column, row: BOARD_ROWS - 1 - row });
}

/** Casas do tabuleiro que um ataque de alcance `range` atinge a partir de `center` (a própria casa não entra). Mesma regra do combate: distância em casas. */
export function cellsWithinRange(center: Hex, range: number): Hex[] {
  return BOARD_CELLS.filter((cell) => {
    const distance = hexDistance(center, cell);
    return distance >= 1 && distance <= range;
  });
}

