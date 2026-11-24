/**
 * Matemática de grade hexagonal "pointy-top" em coordenadas axiais (q, r).
 * A grade de exibição usa deslocamento "odd-r": linhas ímpares ficam deslocadas meio hexágono à direita.
 */

export interface Hex {
  readonly q: number;
  readonly r: number;
}

export interface OffsetCoord {
  readonly column: number;
  readonly row: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Os seis vizinhos de um hexágono, sempre nesta ordem (a ordem fixa serve de desempate no pathfinding). */
export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(hex: Hex): string {
  return `${hex.q},${hex.r}`;
}

export function hexesAreEqual(first: Hex, second: Hex): boolean {
  return first.q === second.q && first.r === second.r;
}

export function addHex(first: Hex, second: Hex): Hex {
  return { q: first.q + second.q, r: first.r + second.r };
}

export function hexNeighbors(hex: Hex): Hex[] {
  return HEX_DIRECTIONS.map((direction) => addHex(hex, direction));
}

/** Distância em passos entre dois hexágonos. */
export function hexDistance(first: Hex, second: Hex): number {
  const deltaQ = first.q - second.q;
  const deltaR = first.r - second.r;
  return (Math.abs(deltaQ) + Math.abs(deltaR) + Math.abs(deltaQ + deltaR)) / 2;
}

export function offsetToAxial({ column, row }: OffsetCoord): Hex {
  return { q: column - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset({ q, r }: Hex): OffsetCoord {
  return { column: q + (r - (r & 1)) / 2, row: r };
}

/** Centro do hexágono na tela, para hexágonos de raio `size` (distância do centro a um vértice). */
export function hexToPixel(hex: Hex, size: number): Point {
  const raizDeTres = Math.sqrt(3);
  return {
    x: size * raizDeTres * (hex.q + hex.r / 2),
    y: size * 1.5 * hex.r,
  };
}

/** Hexágono que contém o ponto da tela. Usado para converter cliques em casas do tabuleiro. */
export function pixelToHex(point: Point, size: number): Hex {
  const raizDeTres = Math.sqrt(3);
  const fractionalQ = ((raizDeTres / 3) * point.x - point.y / 3) / size;
  const fractionalR = ((2 / 3) * point.y) / size;
  return roundToNearestHex(fractionalQ, fractionalR);
}

function roundToNearestHex(fractionalQ: number, fractionalR: number): Hex {
  const fractionalS = -fractionalQ - fractionalR;
  let roundedQ = Math.round(fractionalQ);
  let roundedR = Math.round(fractionalR);
  const roundedS = Math.round(fractionalS);

  const diffQ = Math.abs(roundedQ - fractionalQ);
  const diffR = Math.abs(roundedR - fractionalR);
  const diffS = Math.abs(roundedS - fractionalS);

  if (diffQ > diffR && diffQ > diffS) {
    roundedQ = -roundedR - roundedS;
  } else if (diffR > diffS) {
    roundedR = -roundedQ - roundedS;
  }
  // Soma com 0 evita o valor -0 (que quebraria comparações estritas e a chave em texto).
  return { q: roundedQ + 0, r: roundedR + 0 };
}
