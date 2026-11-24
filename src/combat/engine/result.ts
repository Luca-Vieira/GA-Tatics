import type { BoardSide } from '@shared/constants/board';
import { countsForResult, type CombatUnit } from '../units/unit';

export type CombatWinner = BoardSide | 'draw';
export type CombatEndReason = 'elimination' | 'timeout';

/** Dados brutos do resultado oficial, publicados pelo host (GDD Seção 10 e decisoes-de-design.md, Seção 1). */
export interface CombatResult {
  readonly winner: CombatWinner;
  readonly reason: CombatEndReason;
  readonly durationMs: number;
  /** Vida restante de cada lado, em % da vida máxima somada das unidades que começaram o combate. */
  readonly healthPercentBySide: Readonly<Record<BoardSide, number>>;
  readonly aliveCountBySide: Readonly<Record<BoardSide, number>>;
  readonly survivors: readonly { readonly unitId: string; readonly health: number }[];
  /** Estruturas (torres) destruídas no combate; elas não entram na vida restante nem nas unidades vivas. */
  readonly destroyedStructureIds: readonly string[];
}

const HEALTH_PERCENT_PRECISION = 1e6;

export function buildCombatResult(allUnits: readonly CombatUnit[], reason: CombatEndReason, durationMs: number): CombatResult {
  // Unidades invocadas não entram na contagem: só valem as que o jogador colocou no tabuleiro.
  const units = allUnits.filter(countsForResult);
  const healthPercentBySide = { A: healthPercentOf('A', units), B: healthPercentOf('B', units) };
  const aliveCountBySide = { A: aliveCountOf('A', units), B: aliveCountOf('B', units) };
  return {
    winner: decideWinner(healthPercentBySide, aliveCountBySide),
    reason,
    durationMs,
    healthPercentBySide,
    aliveCountBySide,
    survivors: units.filter((unit) => unit.alive).map((unit) => ({ unitId: unit.id, health: unit.health })),
    destroyedStructureIds: allUnits.filter((unit) => unit.isStructure && !unit.alive).map((unit) => unit.id),
  };
}

/** Maior % de vida vence; em empate, vence quem tem mais unidades vivas; persistindo o empate, é empate (GDD 5.5). */
function decideWinner(
  healthPercentBySide: Record<BoardSide, number>,
  aliveCountBySide: Record<BoardSide, number>,
): CombatWinner {
  const healthDifference = roundHealthPercent(healthPercentBySide.A) - roundHealthPercent(healthPercentBySide.B);
  if (healthDifference !== 0) {
    return healthDifference > 0 ? 'A' : 'B';
  }
  const aliveDifference = aliveCountBySide.A - aliveCountBySide.B;
  if (aliveDifference !== 0) {
    return aliveDifference > 0 ? 'A' : 'B';
  }
  return 'draw';
}

function roundHealthPercent(healthPercent: number): number {
  return Math.round(healthPercent * HEALTH_PERCENT_PRECISION);
}

function healthPercentOf(side: BoardSide, units: readonly CombatUnit[]): number {
  const sideUnits = units.filter((unit) => unit.side === side);
  const totalMaxHealth = sum(sideUnits.map((unit) => unit.stats.maxHealth));
  if (totalMaxHealth === 0) {
    return 0;
  }
  const remainingHealth = sum(sideUnits.map((unit) => (unit.alive ? unit.health : 0)));
  return (remainingHealth / totalMaxHealth) * 100;
}

function aliveCountOf(side: BoardSide, units: readonly CombatUnit[]): number {
  return units.filter((unit) => unit.side === side && unit.alive).length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
