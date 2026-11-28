/** Prévia de um mapa: o fundo e o tabuleiro, desenhados com o mesmo código e a mesma posição do jogo. */
import { mapSchema, type MapDefinition } from '@data/schemas/map';
import { BOARD_CENTER, BOARD_HEX_SIZE } from '@rendering/layout/gameLayout';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '@rendering/display/renderScale';
import { BOARD_CELLS, sideOfCell } from '@shared/constants/board';
import { cssColorOf, paintBackground, tilePaletteOf } from '@shared/scenery/mapPainting';
import { createBoardProjection } from '@shared/utils/boardProjection';
import { el } from './dom';

export interface MapPreview {
  readonly element: HTMLElement;
  /** Redesenha com o rascunho atual; um rascunho inválido mantém o último desenho. */
  update(draft: unknown): void;
}

const PREVIEW_SCALE = 0.5;
const TILE_RADIUS = BOARD_HEX_SIZE - 2;

export function createMapPreview(serverUrl: string): MapPreview {
  const canvas = el('canvas', { className: 'map-preview' });
  canvas.width = LOGICAL_WIDTH * PREVIEW_SCALE;
  canvas.height = LOGICAL_HEIGHT * PREVIEW_SCALE;
  const images = new Map<string, HTMLImageElement>();
  let shown: MapDefinition | null = null;

  const imageOf = (map: MapDefinition): HTMLImageElement | undefined => {
    if (map.background.type !== 'image') {
      return undefined;
    }
    const url = `${serverUrl}${map.background.path}`;
    let image = images.get(url);
    if (!image) {
      image = new Image();
      image.onload = () => draw();
      image.src = url;
      images.set(url, image);
    }
    return image.complete && image.naturalWidth > 0 ? image : undefined;
  };

  const draw = () => {
    const context = canvas.getContext('2d');
    if (!context || !shown) {
      return;
    }
    context.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    paintBackground(context, shown.background, LOGICAL_WIDTH, LOGICAL_HEIGHT, imageOf(shown));
    paintBoard(context, shown);
  };

  return {
    element: canvas,
    update(draft) {
      const parsed = mapSchema.safeParse(draft);
      if (parsed.success) {
        shown = parsed.data;
        draw();
      }
    },
  };
}

function paintBoard(context: CanvasRenderingContext2D, map: MapDefinition): void {
  const projection = createBoardProjection(BOARD_CENTER, { hexSize: BOARD_HEX_SIZE });
  const cellsFromBackToFront = [...BOARD_CELLS].sort((first, second) => projection.cellToGround(first).y - projection.cellToGround(second).y);
  context.lineWidth = 2;
  for (const cell of cellsFromBackToFront) {
    const palette = tilePaletteOf(map.tiles, sideOfCell(cell) === 'B' ? 'left' : 'right', cell);
    const center = projection.cellToGround(cell);
    context.beginPath();
    for (let corner = 0; corner < 6; corner++) {
      const angle = (Math.PI / 180) * 60 * corner;
      const x = center.x + TILE_RADIUS * Math.cos(angle);
      const y = center.y + TILE_RADIUS * Math.sin(angle) * projection.tilt;
      if (corner === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.closePath();
    context.fillStyle = cssColorOf(palette.top);
    context.fill();
    context.strokeStyle = cssColorOf(palette.edge);
    context.stroke();
  }
}
