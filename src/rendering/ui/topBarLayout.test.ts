import { describe, expect, it } from 'vitest';
import { LEAVE_BUTTON } from '../layout/gameLayout';
import { CHIP_AREA, chipSlots } from './topBarLayout';

describe('chipSlots', () => {
  it('de 2 a 8 jogadores, as fichas cabem na área sem se sobrepor nem cobrir o botão de sair', () => {
    for (let playerCount = 2; playerCount <= 8; playerCount++) {
      const slots = chipSlots(playerCount);
      expect(slots).toHaveLength(playerCount);
      slots.forEach((slot, index) => {
        const next = slots[index + 1];
        expect(slot.x).toBeGreaterThanOrEqual(CHIP_AREA.left);
        expect(slot.x + slot.width).toBeLessThanOrEqual(LEAVE_BUTTON.x);
        expect(slot.width).toBeGreaterThanOrEqual(90);
        if (next) {
          expect(next.x).toBeGreaterThan(slot.x + slot.width);
        }
      });
    }
  });
});
