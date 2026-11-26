import type { Point } from '@shared/utils/hex';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../display/renderScale';

/**
 * Onde cada parte da tela de partida fica, em unidades de tela (1280x720). De cima para baixo: placar; sinergias à
 * esquerda e tabuleiro deitado ao centro; faixa da reserva com o botão principal; loja. Os alvos de toque foram
 * dimensionados para um celular deitado, onde cada unidade de tela vale cerca de meio pixel.
 */

export const SCREEN_WIDTH = LOGICAL_WIDTH;
export const SCREEN_HEIGHT = LOGICAL_HEIGHT;

export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const TOP_BAR_HEIGHT = 56;
export const LEAVE_BUTTON: Rectangle = { x: 1178, y: 6, width: 94, height: 44 };

export const BOARD_CENTER: Point = { x: 718, y: 290 };
export const BOARD_HEX_SIZE = 58;

export const SYNERGY_PANEL: Rectangle = { x: 8, y: 64, width: 150, height: 442 };

/** O painel de detalhes flutua sobre o tabuleiro, do lado oposto ao da unidade consultada (a largura é do painel). */
export const INFO_PANEL_TOP = 62;
export const INFO_PANEL_LEFT_X = 166;

export const BENCH_ROW: Rectangle = { x: 190, y: 513, width: 828, height: 80 };
const BENCH_SLOT_GAP = 8;
const MAXIMUM_BENCH_SLOT_WIDTH = 90;

export const MAIN_BUTTON: Rectangle = { x: 1036, y: 514, width: 232, height: 78 };

export const SHOP_AREA: Rectangle = { x: 12, y: 602, width: 988, height: 112 };
/** Moedas e atualizar. Fica longe do canto inferior direito, onde está o botão de som. */
export const SHOP_SIDE: Rectangle = { x: 1012, y: 602, width: 168, height: 112 };

export const STATUS_LINE_Y = 505;
export const TOAST_Y = 462;

/** Casas da reserva em fila, centralizadas na faixa, para qualquer quantidade configurada. */
export function benchSlotLayouts(slotCount: number): { readonly center: Point; readonly width: number; readonly height: number }[] {
  const count = Math.max(1, slotCount);
  const width = Math.min(MAXIMUM_BENCH_SLOT_WIDTH, Math.floor((BENCH_ROW.width - (count - 1) * BENCH_SLOT_GAP) / count));
  const rowWidth = count * width + (count - 1) * BENCH_SLOT_GAP;
  const firstCenterX = BOARD_CENTER.x - rowWidth / 2 + width / 2;
  return Array.from({ length: slotCount }, (_, slot) => ({
    center: { x: firstCenterX + slot * (width + BENCH_SLOT_GAP), y: BENCH_ROW.y + BENCH_ROW.height / 2 },
    width,
    height: BENCH_ROW.height,
  }));
}
