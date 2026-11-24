/**
 * Gerador pseudoaleatório com semente (mulberry32).
 * Mesma semente produz sempre a mesma sequência, o que torna combates e sorteios reproduzíveis nos testes.
 */

/** Converte um texto em um número de 32 bits (FNV-1a). Usado para derivar sementes, ex.: prefixo + índice de rotação. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let position = 0; position < text.length; position++) {
    hash ^= text.charCodeAt(position);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class SeededRandom {
  private state: number;

  constructor(seed: number | string) {
    this.state = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  }

  /** Próximo número no intervalo [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro entre `minimum` e `maximum`, ambos inclusos. */
  integerBetween(minimum: number, maximum: number): number {
    return minimum + Math.floor(this.next() * (maximum - minimum + 1));
  }

  /** Verdadeiro com a probabilidade informada (0 a 1). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<Item>(items: readonly Item[]): Item {
    if (items.length === 0) {
      throw new Error('Não é possível sortear de uma lista vazia.');
    }
    return items[this.integerBetween(0, items.length - 1)] as Item;
  }

  /** Cópia embaralhada (Fisher-Yates); a lista original não é alterada. */
  shuffled<Item>(items: readonly Item[]): Item[] {
    const copy = [...items];
    for (let position = copy.length - 1; position > 0; position--) {
      const swapPosition = this.integerBetween(0, position);
      [copy[position], copy[swapPosition]] = [copy[swapPosition] as Item, copy[position] as Item];
    }
    return copy;
  }
}
