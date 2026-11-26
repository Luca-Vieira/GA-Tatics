import { BOARD_CELLS, mirrorCell } from '../constants/board';
import { hexToPixel, pixelToHex, type Hex, type Point } from './hex';

/**
 * Projeção do tabuleiro deitado. As casas continuam nas mesmas coordenadas lógicas (linhas = eixo de batalha); só o
 * desenho gira 90°: telaX = −yLógico e telaY = xLógico. Assim os hexágonos ficam "flat-top" (com lados retos em cima e
 * embaixo) e o lado B, de quem vê, fica à esquerda.
 */

/** Raio de cada hexágono, em pixels, antes da inclinação. */
export const HEX_SIZE = 58;
/** Fração da altura que o chão mantém na tela: 1 = visto de cima, valores menores = câmera mais baixa. */
export const GROUND_TILT = 0.72;
/** Quanto menores ficam os personagens do fundo em relação aos da frente (0,1 = 10%). */
export const PERSPECTIVE_STRENGTH = 0.1;

export interface BoardProjection {
  readonly hexSize: number;
  readonly tilt: number;
  /** Ponto da tela onde ficam os pés de quem está na casa (centro da casa já inclinada). */
  cellToGround(cell: Hex): Point;
  /** Casa sob o ponto da tela. Pode devolver casas fora do tabuleiro; use `isInsideBoard` para conferir. */
  groundToCell(point: Point): Hex;
  /** Escala de perspectiva (entre 1 − força e 1) para um personagem com os pés em `groundY`. */
  perspectiveScaleAt(groundY: number): number;
}

export interface BoardProjectionOptions {
  readonly hexSize?: number;
  readonly tilt?: number;
  readonly perspectiveStrength?: number;
}

/** Centro da casa no chão visto de cima, já girado para a tela deitada. */
function flatCenterOf(cell: Hex, hexSize: number): Point {
  const logical = hexToPixel(cell, hexSize);
  return { x: -logical.y, y: logical.x };
}

/** Projeção do tabuleiro: chão inclinado (achatado na vertical) com o centro do tabuleiro em `screenCenter`. */
export function createBoardProjection(screenCenter: Point, options: BoardProjectionOptions = {}): BoardProjection {
  const hexSize = options.hexSize ?? HEX_SIZE;
  const tilt = options.tilt ?? GROUND_TILT;
  const perspectiveStrength = options.perspectiveStrength ?? PERSPECTIVE_STRENGTH;

  const flatCenters = BOARD_CELLS.map((cell) => flatCenterOf(cell, hexSize));
  const flatXs = flatCenters.map((center) => center.x);
  const tiltedYs = flatCenters.map((center) => center.y * tilt);
  const offsetX = screenCenter.x - (Math.min(...flatXs) + Math.max(...flatXs)) / 2;
  const offsetY = screenCenter.y - (Math.min(...tiltedYs) + Math.max(...tiltedYs)) / 2;
  const farthestGroundY = Math.min(...tiltedYs) + offsetY;
  const nearestGroundY = Math.max(...tiltedYs) + offsetY;

  return {
    hexSize,
    tilt,
    cellToGround(cell) {
      const flat = flatCenterOf(cell, hexSize);
      return { x: flat.x + offsetX, y: flat.y * tilt + offsetY };
    },
    groundToCell(point) {
      const flat = { x: point.x - offsetX, y: (point.y - offsetY) / tilt };
      return pixelToHex({ x: flat.y, y: -flat.x }, hexSize);
    },
    perspectiveScaleAt(groundY) {
      const depthRatio = (groundY - farthestGroundY) / (nearestGroundY - farthestGroundY);
      const clampedRatio = Math.min(Math.max(depthRatio, 0), 1);
      return 1 - perspectiveStrength * (1 - clampedRatio);
    },
  };
}

/**
 * Projeção vista "de cabeça para baixo": gira o tabuleiro 180° na tela. Serve para mostrar o combate do ponto de vista
 * de quem luta como lado A, que assim também aparece na metade esquerda.
 */
export function flipBoardProjection(projection: BoardProjection): BoardProjection {
  return {
    ...projection,
    cellToGround: (cell) => projection.cellToGround(mirrorCell(cell)),
    groundToCell: (point) => mirrorCell(projection.groundToCell(point)),
  };
}
