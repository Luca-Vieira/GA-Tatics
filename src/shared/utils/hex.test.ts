import { describe, expect, it } from 'vitest';
import {
  axialToOffset,
  hexDistance,
  hexNeighbors,
  hexToPixel,
  offsetToAxial,
  pixelToHex,
  type Hex,
} from './hex';

describe('hexDistance', () => {
  it('é zero para o mesmo hexágono', () => {
    expect(hexDistance({ q: 2, r: -1 }, { q: 2, r: -1 })).toBe(0);
  });

  it('é 1 para cada um dos seis vizinhos', () => {
    const origem: Hex = { q: 0, r: 0 };
    for (const vizinho of hexNeighbors(origem)) {
      expect(hexDistance(origem, vizinho)).toBe(1);
    }
  });

  it('é simétrica', () => {
    const primeiro: Hex = { q: 3, r: -2 };
    const segundo: Hex = { q: -1, r: 4 };
    expect(hexDistance(primeiro, segundo)).toBe(hexDistance(segundo, primeiro));
  });

  it('calcula distâncias conhecidas', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);
  });
});

describe('hexNeighbors', () => {
  it('devolve seis vizinhos distintos', () => {
    const vizinhos = hexNeighbors({ q: 1, r: 1 });
    expect(vizinhos).toHaveLength(6);
    expect(new Set(vizinhos.map((vizinho) => `${vizinho.q},${vizinho.r}`)).size).toBe(6);
  });
});

describe('conversão axial e deslocamento (odd-r)', () => {
  it('é reversível para todas as casas de uma área ampla', () => {
    for (let row = -3; row < 10; row++) {
      for (let column = -3; column < 10; column++) {
        const axial = offsetToAxial({ column, row });
        expect(axialToOffset(axial)).toEqual({ column, row });
      }
    }
  });

  it('mantém vizinhos de uma linha com distância 1', () => {
    const esquerda = offsetToAxial({ column: 1, row: 2 });
    const direita = offsetToAxial({ column: 2, row: 2 });
    expect(hexDistance(esquerda, direita)).toBe(1);
  });

  it('desloca linhas ímpares meio hexágono à direita', () => {
    const linhaPar = hexToPixel(offsetToAxial({ column: 0, row: 0 }), 10);
    const linhaImpar = hexToPixel(offsetToAxial({ column: 0, row: 1 }), 10);
    expect(linhaImpar.x - linhaPar.x).toBeCloseTo((Math.sqrt(3) * 10) / 2);
  });
});

describe('pixelToHex', () => {
  it('devolve o hexágono original a partir do seu centro', () => {
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 5; column++) {
        const hex = offsetToAxial({ column, row });
        expect(pixelToHex(hexToPixel(hex, 44), 44)).toEqual(hex);
      }
    }
  });

  it('aceita pontos próximos do centro', () => {
    const hex: Hex = { q: 2, r: 3 };
    const centro = hexToPixel(hex, 44);
    expect(pixelToHex({ x: centro.x + 10, y: centro.y - 8 }, 44)).toEqual(hex);
  });
});
