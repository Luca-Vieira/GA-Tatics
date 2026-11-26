/**
 * Mini tabuleiro deitado que mostra a área de ataque, com o personagem olhando para a direita. É o tabuleiro real girado
 * 90° como na partida: hexágonos de topo plano, telaX = −yLógico e telaY = xLógico. Quem está nas linhas altas fica à
 * esquerda e, olhando para a direita, vira para o lado A.
 */
import { BOARD_CELLS, BOARD_COLUMNS, BOARD_ROWS } from '@shared/constants/board';
import { attackAreaCells, type AttackFacing, type AttackShape } from '@shared/utils/attackArea';
import { axialToOffset, hexKey, hexToPixel, offsetToAxial, type Hex, type Point } from '@shared/utils/hex';

export const FACING_RIGHT: AttackFacing = 'toA';

export type GridCellKind = 'origin' | 'area' | 'empty';

export interface GridCell {
  readonly cell: Hex;
  readonly kind: GridCellKind;
  readonly center: Point;
  /** Vértices no formato do atributo `points` do SVG. */
  readonly points: string;
}

export interface AttackGrid {
  readonly width: number;
  readonly height: number;
  readonly origin: Hex;
  readonly cells: readonly GridCell[];
}

const PADDING = 2;

/** Casa na tela deitada, antes de encostar o desenho na origem. */
export function toLandscapePoint(cell: Hex, hexSize: number): Point {
  const upright = hexToPixel(cell, hexSize);
  return { x: -upright.y, y: upright.x };
}

/** Onde pôr o personagem: na coluna do meio, na linha que mostra mais casas da área; no empate, a mais central. */
export function chooseDisplayOrigin(shape: AttackShape, range: number): Hex {
  const middleColumn = Math.floor(BOARD_COLUMNS / 2);
  const middleRow = (BOARD_ROWS - 1) / 2;
  const candidates = Array.from({ length: BOARD_ROWS }, (_, row) => {
    const origin = offsetToAxial({ column: middleColumn, row });
    return { origin, covered: attackAreaCells(origin, shape, range, FACING_RIGHT).length, offCenter: Math.abs(row - middleRow) };
  });
  // No empate de cobertura e centro, fica a linha mais à esquerda na tela (a maior), que deixa a frente livre.
  candidates.sort(
    (first, second) => second.covered - first.covered || first.offCenter - second.offCenter || axialToOffset(second.origin).row - axialToOffset(first.origin).row,
  );
  return (candidates[0] as (typeof candidates)[number]).origin;
}

function hexagonPoints(center: Point, radius: number): string {
  // Topo plano: os vértices ficam nos múltiplos de 60°.
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = (Math.PI / 3) * corner;
    return `${(center.x + radius * Math.cos(angle)).toFixed(1)},${(center.y + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

export function buildAttackGrid(shape: AttackShape, range: number, hexSize = 16): AttackGrid {
  const origin = chooseDisplayOrigin(shape, range);
  const areaKeys = new Set(attackAreaCells(origin, shape, range, FACING_RIGHT).map(hexKey));
  const rawCenters = BOARD_CELLS.map((cell) => ({ cell, point: toLandscapePoint(cell, hexSize) }));
  const halfHeight = (Math.sqrt(3) / 2) * hexSize;
  const minimumX = Math.min(...rawCenters.map(({ point }) => point.x)) - hexSize - PADDING;
  const minimumY = Math.min(...rawCenters.map(({ point }) => point.y)) - halfHeight - PADDING;
  const maximumX = Math.max(...rawCenters.map(({ point }) => point.x)) + hexSize + PADDING;
  const maximumY = Math.max(...rawCenters.map(({ point }) => point.y)) + halfHeight + PADDING;

  const cells = rawCenters.map(({ cell, point }): GridCell => {
    const center = { x: point.x - minimumX, y: point.y - minimumY };
    const kind: GridCellKind = hexKey(cell) === hexKey(origin) ? 'origin' : areaKeys.has(hexKey(cell)) ? 'area' : 'empty';
    return { cell, kind, center, points: hexagonPoints(center, hexSize - 1) };
  });
  return { width: maximumX - minimumX, height: maximumY - minimumY, origin, cells };
}
