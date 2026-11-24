import { hexDistance, hexNeighbors, type Hex } from '@shared/utils/hex';
import type { CombatUnit } from '../units/unit';

function distanceToNearestEnemy(cell: Hex, enemies: readonly CombatUnit[]): number {
  return Math.min(...enemies.map((enemy) => hexDistance(cell, enemy.cell)));
}

/** Verdadeiro se o personagem "kite" está mais perto de algum inimigo do que a distância que prefere manter. */
export function isTooCloseToEnemies(unit: CombatUnit, enemies: readonly CombatUnit[]): boolean {
  if (unit.behavior.movement !== 'kite' || enemies.length === 0) {
    return false;
  }
  return distanceToNearestEnemy(unit.cell, enemies) < unit.behavior.preferredDistance;
}

/**
 * Casa vizinha livre que mais afasta a unidade do inimigo mais próximo; null se nenhuma melhorar a distância atual
 * (por exemplo, quando está encurralada). Empates seguem a ordem fixa dos vizinhos.
 */
export function findRetreatCell(unit: CombatUnit, enemies: readonly CombatUnit[], isCellFree: (cell: Hex) => boolean): Hex | null {
  if (enemies.length === 0) {
    return null;
  }
  let bestCell: Hex | null = null;
  let bestDistance = distanceToNearestEnemy(unit.cell, enemies);
  for (const neighbor of hexNeighbors(unit.cell)) {
    if (!isCellFree(neighbor)) {
      continue;
    }
    const distance = distanceToNearestEnemy(neighbor, enemies);
    if (distance > bestDistance) {
      bestCell = neighbor;
      bestDistance = distance;
    }
  }
  return bestCell;
}
