/** Casas "flat-top" do tabuleiro deitado, para os desenhos do painel (prévia de sprite e área de ataque). */
import { GROUND_TILT } from '@shared/utils/boardProjection';
import type { Hex, Point } from '@shared/utils/hex';

const CORNER_COUNT = 6;

/**
 * Centro da casa na tela deitada, em relação à casa (0, 0): o tabuleiro lógico é girado 90°, então o eixo de batalha
 * (linhas) vira a horizontal, com o lado B à esquerda.
 */
export function flatTopCellCenter(cell: Hex, size: number, tilt = GROUND_TILT): Point {
  const logicalX = size * Math.sqrt(3) * (cell.q + cell.r / 2);
  const logicalY = size * 1.5 * cell.r;
  return { x: -logicalY + 0, y: logicalX * tilt + 0 };
}

/** Pontos de um hexágono "flat-top" inclinado, no formato do atributo `points` do SVG. */
export function flatTopHexPoints(center: Point, size: number, tilt = GROUND_TILT): string {
  return Array.from({ length: CORNER_COUNT }, (_, corner) => {
    const angle = (Math.PI / 3) * corner;
    const x = center.x + size * Math.cos(angle);
    const y = center.y + size * Math.sin(angle) * tilt;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}
