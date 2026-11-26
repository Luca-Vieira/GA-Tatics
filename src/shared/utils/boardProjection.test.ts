import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, cellsOfSide, isInsideBoard, mirrorCell } from '../constants/board';
import { createBoardProjection, flipBoardProjection, GROUND_TILT } from './boardProjection';

const SCREEN_CENTER = { x: 640, y: 400 };

describe('createBoardProjection', () => {
  const projection = createBoardProjection(SCREEN_CENTER);

  it('converte a posição de cada casa de volta para a mesma casa', () => {
    for (const cell of BOARD_CELLS) {
      expect(projection.groundToCell(projection.cellToGround(cell))).toEqual(cell);
    }
  });

  it('reconhece cliques deslocados dentro da casa, mesmo com o chão inclinado', () => {
    for (const cell of BOARD_CELLS) {
      const ground = projection.cellToGround(cell);
      const clicked = projection.groundToCell({ x: ground.x + 12, y: ground.y - 8 });
      expect(clicked).toEqual(cell);
    }
  });

  it('centraliza o tabuleiro no ponto pedido', () => {
    const grounds = BOARD_CELLS.map((cell) => projection.cellToGround(cell));
    const xs = grounds.map((ground) => ground.x);
    const ys = grounds.map((ground) => ground.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(SCREEN_CENTER.x);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(SCREEN_CENTER.y);
  });

  it('achata a vertical pelo fator de inclinação', () => {
    const flat = createBoardProjection(SCREEN_CENTER, { tilt: 1 });
    const tilted = createBoardProjection(SCREEN_CENTER, { tilt: GROUND_TILT });
    const first = BOARD_CELLS[0]!;
    const last = BOARD_CELLS[BOARD_CELLS.length - 1]!;
    const flatSpan = flat.cellToGround(last).y - flat.cellToGround(first).y;
    const tiltedSpan = tilted.cellToGround(last).y - tilted.cellToGround(first).y;
    expect(tiltedSpan).toBeCloseTo(flatSpan * GROUND_TILT);
  });

  it('o espelho de cada casa fica simétrico em torno do centro da tela', () => {
    for (const cell of BOARD_CELLS) {
      const ground = projection.cellToGround(cell);
      const mirrored = projection.cellToGround(mirrorCell(cell));
      expect(ground.x + mirrored.x).toBeCloseTo(SCREEN_CENTER.x * 2);
      expect(ground.y + mirrored.y).toBeCloseTo(SCREEN_CENTER.y * 2);
    }
  });

  it('a perspectiva vai de (1 − força) no fundo até 1 na frente e nunca sai desse intervalo', () => {
    const strength = 0.1;
    const custom = createBoardProjection(SCREEN_CENTER, { perspectiveStrength: strength });
    const ys = BOARD_CELLS.map((cell) => custom.cellToGround(cell).y);
    expect(custom.perspectiveScaleAt(Math.min(...ys))).toBeCloseTo(1 - strength);
    expect(custom.perspectiveScaleAt(Math.max(...ys))).toBeCloseTo(1);
    expect(custom.perspectiveScaleAt(-1000)).toBeCloseTo(1 - strength);
    expect(custom.perspectiveScaleAt(5000)).toBeCloseTo(1);
  });

  it('as casas projetadas continuam dentro do tabuleiro para cliques no centro', () => {
    for (const cell of BOARD_CELLS) {
      expect(isInsideBoard(projection.groundToCell(projection.cellToGround(cell)))).toBe(true);
    }
  });
});

describe('tabuleiro deitado', () => {
  const projection = createBoardProjection(SCREEN_CENTER);

  it('o lado B, de quem vê, fica à esquerda e o lado A à direita', () => {
    for (const cell of cellsOfSide('B')) {
      expect(projection.cellToGround(cell).x).toBeLessThan(SCREEN_CENTER.x);
    }
    for (const cell of cellsOfSide('A')) {
      expect(projection.cellToGround(cell).x).toBeGreaterThan(SCREEN_CENTER.x);
    }
  });

  it('é bem mais largo do que alto', () => {
    const grounds = BOARD_CELLS.map((cell) => projection.cellToGround(cell));
    const widthSpan = Math.max(...grounds.map((ground) => ground.x)) - Math.min(...grounds.map((ground) => ground.x));
    const heightSpan = Math.max(...grounds.map((ground) => ground.y)) - Math.min(...grounds.map((ground) => ground.y));
    expect(widthSpan).toBeGreaterThan(heightSpan * 2);
  });

  it('é uma rotação (não um espelho) do tabuleiro lógico', () => {
    const origin = projection.cellToGround({ q: 0, r: 0 });
    const alongRow = projection.cellToGround({ q: 1, r: 0 });
    const towardsB = projection.cellToGround({ q: -1, r: 2 });
    // Andar numa linha lógica desce na tela; avançar rumo às linhas do lado B vai para a esquerda.
    expect(alongRow.y).toBeGreaterThan(origin.y);
    expect(alongRow.x).toBeCloseTo(origin.x);
    expect(towardsB.x).toBeLessThan(origin.x);
    expect(towardsB.y).toBeCloseTo(origin.y);
  });
});

describe('flipBoardProjection', () => {
  const projection = createBoardProjection(SCREEN_CENTER);
  const flipped = flipBoardProjection(projection);

  it('gira o tabuleiro 180° em torno do centro da tela', () => {
    for (const cell of BOARD_CELLS) {
      const ground = projection.cellToGround(cell);
      const turned = flipped.cellToGround(cell);
      expect(ground.x + turned.x).toBeCloseTo(SCREEN_CENTER.x * 2);
      expect(ground.y + turned.y).toBeCloseTo(SCREEN_CENTER.y * 2);
    }
  });

  it('o lado A passa a ocupar a metade esquerda da tela', () => {
    for (const cell of cellsOfSide('A')) {
      expect(flipped.cellToGround(cell).x).toBeLessThan(SCREEN_CENTER.x);
    }
  });

  it('converte a posição de volta para a mesma casa', () => {
    for (const cell of BOARD_CELLS) {
      expect(flipped.groundToCell(flipped.cellToGround(cell))).toEqual(cell);
    }
  });
});
