import { describe, expect, it } from 'vitest';
import { hashString, SeededRandom } from './random';

function sequenciaDe(random: SeededRandom, quantidade: number): number[] {
  return Array.from({ length: quantidade }, () => random.next());
}

describe('SeededRandom', () => {
  it('repete a mesma sequência para a mesma semente', () => {
    expect(sequenciaDe(new SeededRandom(42), 50)).toEqual(sequenciaDe(new SeededRandom(42), 50));
  });

  it('produz sequências diferentes para sementes diferentes', () => {
    expect(sequenciaDe(new SeededRandom(1), 10)).not.toEqual(sequenciaDe(new SeededRandom(2), 10));
  });

  it('aceita semente em texto e a trata como o hash do texto', () => {
    expect(sequenciaDe(new SeededRandom('rot-7'), 10)).toEqual(sequenciaDe(new SeededRandom(hashString('rot-7')), 10));
  });

  it('gera números em [0, 1)', () => {
    const random = new SeededRandom(7);
    for (let tentativa = 0; tentativa < 10_000; tentativa++) {
      const valor = random.next();
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(1);
    }
  });

  it('integerBetween respeita os dois limites e alcança ambos', () => {
    const random = new SeededRandom(99);
    const vistos = new Set<number>();
    for (let tentativa = 0; tentativa < 2_000; tentativa++) {
      const valor = random.integerBetween(2, 5);
      expect(valor).toBeGreaterThanOrEqual(2);
      expect(valor).toBeLessThanOrEqual(5);
      vistos.add(valor);
    }
    expect([...vistos].sort()).toEqual([2, 3, 4, 5]);
  });

  it('chance aproxima a probabilidade pedida', () => {
    const random = new SeededRandom(5);
    let acertos = 0;
    const total = 20_000;
    for (let tentativa = 0; tentativa < total; tentativa++) {
      if (random.chance(0.25)) acertos++;
    }
    expect(acertos / total).toBeGreaterThan(0.23);
    expect(acertos / total).toBeLessThan(0.27);
  });

  it('shuffled mantém os mesmos itens, não altera a lista original e é reproduzível', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const embaralhada = new SeededRandom(3).shuffled(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...embaralhada].sort((a, b) => a - b)).toEqual(original);
    expect(new SeededRandom(3).shuffled(original)).toEqual(embaralhada);
  });

  it('pick falha em lista vazia', () => {
    expect(() => new SeededRandom(1).pick([])).toThrow();
  });
});

describe('hashString', () => {
  it('é estável e distingue textos parecidos', () => {
    expect(hashString('merge-escritorio-rot-1')).toBe(hashString('merge-escritorio-rot-1'));
    expect(hashString('merge-escritorio-rot-1')).not.toBe(hashString('merge-escritorio-rot-2'));
  });
});
