/** Posição das fichas dos jogadores no placar, para qualquer quantidade de 2 a 8. */

export const CHIP_AREA = { left: 392, right: 1170 } as const;
const MAXIMUM_CHIP_WIDTH = 160;
const CHIP_GAP = 6;

export interface ChipSlot {
  readonly x: number;
  readonly width: number;
}

/** Fichas de largura igual, encostadas à direita da área (perto do botão de sair). */
export function chipSlots(playerCount: number): ChipSlot[] {
  const count = Math.max(1, playerCount);
  const areaWidth = CHIP_AREA.right - CHIP_AREA.left;
  const width = Math.min(MAXIMUM_CHIP_WIDTH, Math.floor((areaWidth - (count - 1) * CHIP_GAP) / count));
  const rowWidth = count * width + (count - 1) * CHIP_GAP;
  return Array.from({ length: playerCount }, (_, index) => ({ x: CHIP_AREA.right - rowWidth + index * (width + CHIP_GAP), width }));
}
