import { hexDistance } from '@shared/utils/hex';
import type { CombatUnit } from '../units/unit';

/** Raio, em casas, em torno do alvo usado para medir "grupos" de inimigos (perfil de alvo "cluster"). */
const CLUSTER_RADIUS = 2;
/** Folga além do alcance de ataque dentro da qual a prioridade de alvo é considerada. */
const PRIORITY_REACH_MARGIN = 2;

function aliveEnemiesOf(unit: CombatUnit, allUnits: readonly CombatUnit[]): CombatUnit[] {
  return allUnits.filter((candidate) => candidate.alive && candidate.side !== unit.side);
}

/** Menor chave vence (comparação lexicográfica); empate final pelo menor id, para o resultado ser reproduzível. */
function pickBest(candidates: readonly CombatUnit[], keysOf: (candidate: CombatUnit) => readonly number[]): CombatUnit | null {
  let best: CombatUnit | null = null;
  let bestKeys: readonly number[] = [];
  for (const candidate of candidates) {
    const keys = keysOf(candidate);
    if (best === null || isLexicographicallyBetter(keys, bestKeys, candidate, best)) {
      best = candidate;
      bestKeys = keys;
    }
  }
  return best;
}

function isLexicographicallyBetter(keys: readonly number[], bestKeys: readonly number[], candidate: CombatUnit, best: CombatUnit): boolean {
  for (let position = 0; position < keys.length; position++) {
    const difference = keys[position]! - bestKeys[position]!;
    if (difference !== 0) {
      return difference < 0;
    }
  }
  return candidate.id < best.id;
}

/** Inimigo vivo mais próximo. Empates são resolvidos pelo menor id. */
export function findNearestEnemy(unit: CombatUnit, allUnits: readonly CombatUnit[]): CombatUnit | null {
  return pickBest(aliveEnemiesOf(unit, allUnits), (enemy) => [hexDistance(unit.cell, enemy.cell)]);
}

/**
 * Escolhe o alvo segundo o perfil do personagem, entre os inimigos vivos aceitos por `isEligible`. "nearest" e
 * "farthest" olham o campo todo; "lowest_health" e "cluster" só consideram inimigos a até (alcance + 2) casas e,
 * se não houver nenhum, vale o mais próximo.
 */
export function selectTarget(unit: CombatUnit, allUnits: readonly CombatUnit[], isEligible: (enemy: CombatUnit) => boolean = () => true): CombatUnit | null {
  const enemies = aliveEnemiesOf(unit, allUnits);
  const eligibleEnemies = enemies.filter(isEligible);
  const nearestEnemy = pickBest(eligibleEnemies, (enemy) => [hexDistance(unit.cell, enemy.cell)]);
  const priority = unit.behavior.targetPriority;
  if (priority === 'nearest' || nearestEnemy === null) {
    return nearestEnemy;
  }
  if (priority === 'farthest') {
    return pickBest(eligibleEnemies, (enemy) => [-hexDistance(unit.cell, enemy.cell)]);
  }

  const reach = unit.stats.range + PRIORITY_REACH_MARGIN;
  const candidates = eligibleEnemies.filter((enemy) => hexDistance(unit.cell, enemy.cell) <= reach);
  if (candidates.length === 0) {
    return nearestEnemy;
  }
  if (priority === 'lowest_health') {
    return pickBest(candidates, (enemy) => [enemy.health, hexDistance(unit.cell, enemy.cell)]);
  }
  return pickBest(candidates, (enemy) => [-countEnemiesAround(enemy, enemies), hexDistance(unit.cell, enemy.cell)]);
}

function countEnemiesAround(center: CombatUnit, enemies: readonly CombatUnit[]): number {
  return enemies.filter((enemy) => hexDistance(center.cell, enemy.cell) <= CLUSTER_RADIUS).length;
}
