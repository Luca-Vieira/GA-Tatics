import { hexKey, hexNeighbors, type Hex } from '@shared/utils/hex';

export interface PathSearchRules {
  /** A casa pode ser atravessada (está no tabuleiro e livre). */
  isWalkable: (hex: Hex) => boolean;
  /** A casa é um destino válido. */
  isGoal: (hex: Hex) => boolean;
}

/**
 * Busca em largura (BFS) até o destino mais próximo.
 * Devolve as casas a percorrer, sem a casa inicial e incluindo o destino; lista vazia se já estiver em um destino;
 * `null` se nenhum destino for alcançável. Os vizinhos são visitados sempre na mesma ordem, então empates são determinísticos.
 */
export function findShortestPath(start: Hex, rules: PathSearchRules): Hex[] | null {
  if (rules.isGoal(start)) {
    return [];
  }

  const startKey = hexKey(start);
  const cameFrom = new Map<string, Hex | null>([[startKey, null]]);
  const queue: Hex[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    for (const neighbor of hexNeighbors(current)) {
      const neighborKey = hexKey(neighbor);
      if (cameFrom.has(neighborKey) || !rules.isWalkable(neighbor)) {
        continue;
      }
      cameFrom.set(neighborKey, current);
      if (rules.isGoal(neighbor)) {
        return rebuildPath(neighbor, startKey, cameFrom);
      }
      queue.push(neighbor);
    }
  }
  return null;
}

export interface BestCellRules {
  /** A casa pode ser atravessada (está no tabuleiro e livre). */
  isWalkable: (hex: Hex) => boolean;
  /** Quanto menor, melhor. */
  scoreOf: (hex: Hex) => number;
}

/**
 * Caminho até a casa alcançável de menor pontuação, desde que ela seja melhor que a casa atual (empate: a mais perto
 * na busca). Serve para chegar o mais perto possível quando nenhum destino desejado é alcançável. `null` se não há
 * casa melhor.
 */
export function findPathToBestCell(start: Hex, rules: BestCellRules): Hex[] | null {
  const startKey = hexKey(start);
  const cameFrom = new Map<string, Hex | null>([[startKey, null]]);
  const queue: Hex[] = [start];
  let bestCell: Hex | null = null;
  let bestScore = rules.scoreOf(start);

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    for (const neighbor of hexNeighbors(current)) {
      const neighborKey = hexKey(neighbor);
      if (cameFrom.has(neighborKey) || !rules.isWalkable(neighbor)) {
        continue;
      }
      cameFrom.set(neighborKey, current);
      queue.push(neighbor);
      const score = rules.scoreOf(neighbor);
      if (score < bestScore) {
        bestCell = neighbor;
        bestScore = score;
      }
    }
  }
  return bestCell ? rebuildPath(bestCell, startKey, cameFrom) : null;
}

function rebuildPath(goal: Hex, startKey: string, cameFrom: ReadonlyMap<string, Hex | null>): Hex[] {
  const reversedPath: Hex[] = [];
  let cursor: Hex | null | undefined = goal;
  while (cursor && hexKey(cursor) !== startKey) {
    reversedPath.push(cursor);
    cursor = cameFrom.get(hexKey(cursor));
  }
  return reversedPath.reverse();
}
