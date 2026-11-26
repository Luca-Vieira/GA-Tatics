import { describe, expect, it } from 'vitest';
import { BOARD_CELLS } from '@shared/constants/board';
import { ATTACK_SHAPES, attackAreaCells } from '@shared/utils/attackArea';
import { hexKey } from '@shared/utils/hex';
import { buildAttackGrid, chooseDisplayOrigin, FACING_RIGHT, toLandscapePoint } from './attackGrid';

describe('mini tabuleiro da área de ataque', () => {
  it('desenha o tabuleiro deitado, mais largo que alto, com tudo dentro do quadro', () => {
    const grid = buildAttackGrid('circle', 2);

    expect(grid.cells).toHaveLength(BOARD_CELLS.length);
    expect(grid.width).toBeGreaterThan(grid.height);
    for (const { center } of grid.cells) {
      expect(center.x).toBeGreaterThan(0);
      expect(center.x).toBeLessThan(grid.width);
      expect(center.y).toBeGreaterThan(0);
      expect(center.y).toBeLessThan(grid.height);
    }
  });

  it('marca a origem e exatamente as casas que o combate usa', () => {
    for (const shape of ATTACK_SHAPES) {
      const grid = buildAttackGrid(shape, 3);
      const marked = grid.cells.filter((cell) => cell.kind === 'area').map((cell) => hexKey(cell.cell));
      const expected = attackAreaCells(grid.origin, shape, 3, FACING_RIGHT).map(hexKey);

      expect(marked.sort()).toEqual(expected.sort());
      expect(grid.cells.filter((cell) => cell.kind === 'origin')).toHaveLength(1);
    }
  });

  it('um ataque só de frente aparece à direita do personagem', () => {
    const grid = buildAttackGrid('front_line', 4);
    const originX = toLandscapePoint(grid.origin, 16).x;
    const area = grid.cells.filter((cell) => cell.kind === 'area');

    expect(area.length).toBeGreaterThan(0);
    expect(area.every((cell) => toLandscapePoint(cell.cell, 16).x > originX)).toBe(true);
  });

  it('um ataque em círculo deixa o personagem perto do meio, com casas dos dois lados', () => {
    const origin = chooseDisplayOrigin('circle', 2);
    const originX = toLandscapePoint(origin, 16).x;
    const area = attackAreaCells(origin, 'circle', 2, FACING_RIGHT).map((cell) => toLandscapePoint(cell, 16).x);

    expect(area.some((x) => x < originX)).toBe(true);
    expect(area.some((x) => x > originX)).toBe(true);
  });
});
