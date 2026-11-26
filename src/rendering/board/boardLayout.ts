import Phaser from 'phaser';
import { BOARD_CELLS, sideOfCell, type BoardSide } from '@shared/constants/board';
import type { BoardProjection } from '@shared/utils/boardProjection';
import type { Hex, Point } from '@shared/utils/hex';

/** Cor do time, usada nas unidades. */
export const SIDE_COLORS = { A: 0x3b82f6, B: 0xf97316 } as const;

const TILE_THICKNESS = 9;
const TILE_GAP = 2;

const TILE_COLORS: Readonly<Record<BoardSide, { readonly top: number; readonly side: number; readonly edge: number }>> = {
  A: { top: 0x2b4a86, side: 0x182a50, edge: 0x6f93d6 },
  B: { top: 0x8a4b22, side: 0x4f2a14, edge: 0xd9976a },
};

export const BOARD_DEPTH = -1000;

/** Desenha as casas como lajotas com espessura, de trás para a frente, para as da frente cobrirem as laterais das de trás. */
export function drawBoard(graphics: Phaser.GameObjects.Graphics, projection: BoardProjection): void {
  const cellsFromBackToFront = [...BOARD_CELLS].sort((first, second) => projection.cellToGround(first).y - projection.cellToGround(second).y);
  for (const cell of cellsFromBackToFront) {
    const colors = TILE_COLORS[sideOfCell(cell)];
    const topCorners = cellCorners(projection, cell);
    const bottomCorners = topCorners.map((corner) => new Phaser.Math.Vector2(corner.x, corner.y + TILE_THICKNESS));

    graphics.fillStyle(colors.side, 1);
    graphics.fillPoints(prismSilhouette(topCorners, bottomCorners), true);

    graphics.fillStyle(colors.top, 1);
    graphics.lineStyle(2, colors.edge, 0.55);
    graphics.fillPoints(topCorners, true);
    graphics.strokePoints(topCorners, true);
  }
  graphics.setDepth(BOARD_DEPTH);
}

/** Contorno colorido sobre uma casa (destaque de arrastar, seleção etc.). */
export function drawCellOutline(graphics: Phaser.GameObjects.Graphics, projection: BoardProjection, cell: Hex, color: number, fillAlpha: number, lineWidth = 3, lineAlpha = 1): void {
  const corners = cellCorners(projection, cell);
  if (fillAlpha > 0) {
    graphics.fillStyle(color, fillAlpha);
    graphics.fillPoints(corners, true);
  }
  graphics.lineStyle(lineWidth, color, lineAlpha);
  graphics.strokePoints(corners, true);
}

function cellCorners(projection: BoardProjection, cell: Hex): Phaser.Math.Vector2[] {
  return hexCorners(projection.cellToGround(cell), projection.hexSize - TILE_GAP, projection.tilt);
}

/** Cantos do hexágono "flat-top" (lados retos em cima e embaixo), com a vertical achatada pela inclinação. */
function hexCorners(center: Point, radius: number, tilt: number): Phaser.Math.Vector2[] {
  const corners: Phaser.Math.Vector2[] = [];
  for (let corner = 0; corner < 6; corner++) {
    const angle = (Math.PI / 180) * 60 * corner;
    corners.push(new Phaser.Math.Vector2(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle) * tilt));
  }
  return corners;
}

/** Contorno do prisma: o topo e a base deslocada para baixo, unidos pelas laterais visíveis (as de baixo). */
function prismSilhouette(topCorners: Phaser.Math.Vector2[], bottomCorners: Phaser.Math.Vector2[]): Phaser.Math.Vector2[] {
  // Cantos 0 a 3 formam a metade inferior do hexágono (direita, baixo-direita, baixo-esquerda, esquerda).
  const lowerTop = [topCorners[0]!, topCorners[1]!, topCorners[2]!, topCorners[3]!];
  const lowerBottom = [bottomCorners[3]!, bottomCorners[2]!, bottomCorners[1]!, bottomCorners[0]!];
  return [...lowerTop, ...lowerBottom];
}
