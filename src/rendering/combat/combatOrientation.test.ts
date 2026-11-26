import { describe, expect, it } from 'vitest';
import { cellsOfSide, mirrorCell } from '@shared/constants/board';
import { defaultFacingOf, facingTowards } from '@shared/utils/attackArea';
import { createBoardProjection, flipBoardProjection } from '@shared/utils/boardProjection';
import { isFacingScreenRight } from './combatOrientation';

const projection = createBoardProjection({ x: 640, y: 290 });

describe('isFacingScreenRight', () => {
  it('quem está do lado esquerdo começa olhando para a direita, nas duas orientações da tela', () => {
    expect(isFacingScreenRight(defaultFacingOf('B'), false)).toBe(true);
    expect(isFacingScreenRight(defaultFacingOf('A'), false)).toBe(false);
    expect(isFacingScreenRight(defaultFacingOf('A'), true)).toBe(true);
    expect(isFacingScreenRight(defaultFacingOf('B'), true)).toBe(false);
  });

  it('acompanha a posição do alvo na tela', () => {
    for (const isViewFlipped of [false, true]) {
      const shown = isViewFlipped ? flipBoardProjection(projection) : projection;
      for (const origin of cellsOfSide('B')) {
        for (const target of [mirrorCell(origin), cellsOfSide('A')[0]!]) {
          const facing = facingTowards(origin, target, 'toA');
          const isTargetToTheRight = shown.cellToGround(target).x > shown.cellToGround(origin).x;
          expect(isFacingScreenRight(facing, isViewFlipped)).toBe(isTargetToTheRight);
        }
      }
    }
  });
});
