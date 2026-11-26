import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, mirrorCell } from '../constants/board';
import { ATTACK_SHAPES, attackAreaCells, canAttackFrom, defaultFacingOf, describeAttackArea, facingTowards, isInAttackArea, sweepTowards } from './attackArea';
import { hexDistance, hexKey, hexNeighbors, offsetToAxial, type Hex } from './hex';

const cellAt = (column: number, row: number): Hex => offsetToAxial({ column, row });
const center = cellAt(2, 5);

describe('orientação', () => {
  it('cada lado começa olhando para o adversário, e a orientação segue o alvo', () => {
    expect(defaultFacingOf('A')).toBe('toB');
    expect(defaultFacingOf('B')).toBe('toA');
    expect(facingTowards(center, cellAt(2, 8), 'toA')).toBe('toB');
    expect(facingTowards(center, cellAt(2, 2), 'toB')).toBe('toA');
    expect(facingTowards(center, cellAt(4, 5), 'toA')).toBe('toA');
  });
});

describe('formatos', () => {
  const neighborsCovered = (shape: (typeof ATTACK_SHAPES)[number]) => hexNeighbors(center).filter((cell) => isInAttackArea(center, cell, shape, 1, 'toB')).length;

  it('no corpo a corpo cada formato cobre uma quantidade diferente de vizinhas', () => {
    expect(neighborsCovered('circle')).toBe(6);
    expect(neighborsCovered('semicircle')).toBe(4);
    expect(neighborsCovered('scythe')).toBe(3);
    expect(neighborsCovered('front_line')).toBe(2);
    expect(neighborsCovered('diagonals')).toBe(2);
    expect(neighborsCovered('dashed')).toBe(2);
  });

  it('formatos com frente não alcançam quem está atrás', () => {
    for (const shape of ['front_line', 'diagonals', 'semicircle', 'scythe', 'dashed'] as const) {
      const cells = attackAreaCells(center, shape, 4, 'toB');
      expect(cells.every((cell) => cell.r >= center.r), shape).toBe(true);
      expect(cells.every((cell) => hexDistance(center, cell) <= 4), shape).toBe(true);
    }
  });

  it('a área tracejada só acerta nas distâncias ímpares', () => {
    const distances = new Set(attackAreaCells(center, 'dashed', 4, 'toB').map((cell) => hexDistance(center, cell)));
    expect([...distances].sort()).toEqual([1, 3]);
  });

  it('a tracejada com centro é a tracejada mais uma única casa: a de 2 casas em linha reta à frente', () => {
    const plain = new Set(attackAreaCells(center, 'dashed', 4, 'toB').map(hexKey));
    const extra = attackAreaCells(center, 'dashed_center', 4, 'toB').filter((cell) => !plain.has(hexKey(cell)));
    expect(extra).toEqual([{ q: center.q - 1, r: center.r + 2 }]);
    expect(hexDistance(center, extra[0]!)).toBe(2);
  });

  it('a foice varre para o lado em que o inimigo está, de frente ou depois de virar', () => {
    for (const facing of ['toA', 'toB'] as const) {
      const low = attackAreaCells(center, 'scythe', 1, facing, 'low');
      const high = attackAreaCells(center, 'scythe', 1, facing, 'high');
      expect(low).not.toEqual(high);
      for (const neighbor of hexNeighbors(center).filter((cell) => low.some((covered) => hexKey(covered) === hexKey(cell)) || high.some((covered) => hexKey(covered) === hexKey(cell)))) {
        expect(isInAttackArea(center, neighbor, 'scythe', 1, facing, sweepTowards(center, neighbor))).toBe(true);
      }
    }
  });

  it('o lado da varredura é o do alvo no eixo lateral; na mesma altura, mantém o anterior', () => {
    const above = { q: center.q - 1, r: center.r };
    const below = { q: center.q + 1, r: center.r };
    const straightAhead = { q: center.q - 1, r: center.r + 2 };
    expect(sweepTowards(center, above)).toBe('low');
    expect(sweepTowards(center, below)).toBe('high');
    expect(sweepTowards(center, straightAhead, 'high')).toBe('high');
    expect(sweepTowards(center, straightAhead, 'low')).toBe('low');
  });

  it('as diagonais são duas retas que se abrem a partir de quem ataca', () => {
    const cells = attackAreaCells(center, 'diagonals', 3, 'toB');
    expect(cells.length).toBeGreaterThan(2);
    expect(cells.every((cell) => cell.q === center.q || cell.q - center.q === -(cell.r - center.r))).toBe(true);
  });

  it('quem alcança também é alcançado pelo mesmo formato: nenhum impasse entre iguais, e os dois lados se equivalem', () => {
    for (const shape of ATTACK_SHAPES) {
      for (const origin of BOARD_CELLS) {
        for (const target of BOARD_CELLS) {
          const forward = canAttackFrom(origin, target, shape, 3, 'A');
          expect(canAttackFrom(target, origin, shape, 3, 'B'), shape).toBe(forward);
          expect(canAttackFrom(mirrorCell(origin), mirrorCell(target), shape, 3, 'B'), shape).toBe(forward);
        }
      }
    }
  });

  it('de qualquer alvo existe uma casa vizinha de onde cada formato o alcança', () => {
    for (const shape of ATTACK_SHAPES) {
      for (const target of BOARD_CELLS) {
        expect(BOARD_CELLS.some((origin) => canAttackFrom(origin, target, shape, 1, 'A')), `${shape} ${target.q},${target.r}`).toBe(true);
      }
    }
  });

  it('descreve o formato em português, com os alvos extras quando há', () => {
    expect(describeAttackArea('scythe', 1)).toBe('Foice: ataca num golpe curvo pela frente e por um lado, para cima ou para baixo conforme o inimigo, alcance 1 casa.');
    expect(describeAttackArea('circle', 3, 2, 0.5)).toContain('Acerta até 2 inimigos; os extras recebem 50% do dano.');
  });
});
