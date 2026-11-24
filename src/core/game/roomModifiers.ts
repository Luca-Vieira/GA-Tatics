import { DEFAULT_COMBAT_TIME_LIMIT_MS } from '@combat/engine/constants';
import type { GameConfig } from '@data/schemas/gameConfig';
import type { RoomModifiers } from '@data/schemas/roomModifiers';

/** Regras de combate vindas dos modificadores da sala. */
export interface CombatRules {
  /** Multiplica a vida e o dano de todas as unidades (1 = normal). */
  readonly statMultiplier: number;
  /** Limite de duração de cada combate. */
  readonly timeLimitMs: number;
}

export const NORMAL_COMBAT_RULES: CombatRules = { statMultiplier: 1, timeLimitMs: DEFAULT_COMBAT_TIME_LIMIT_MS };

/** Configuração do jogo com as vidas, os tempos de preparação e a renda da sala. Não altera a original. */
export function applyRoomModifiers(config: GameConfig, modifiers: RoomModifiers): GameConfig {
  return {
    ...config,
    economy: { ...config.economy, incomeByRound: config.economy.incomeByRound.map((income) => income + modifiers.extraIncome) },
    rounds: {
      ...config.rounds,
      startingLives: config.rounds.startingLives + modifiers.extraLives,
      preparationSeconds: config.rounds.preparationSeconds + modifiers.extraPreparationSeconds,
      shortPreparationSeconds: config.rounds.shortPreparationSeconds + modifiers.extraPreparationSeconds,
    },
  };
}

export function combatRulesOf(modifiers: RoomModifiers): CombatRules {
  return {
    statMultiplier: 1 + modifiers.statBonusPercent / 100,
    timeLimitMs: DEFAULT_COMBAT_TIME_LIMIT_MS + modifiers.extraCombatSeconds * 1000,
  };
}

/** Texto curto de cada regra ativa, para listar na tela (vazio = regras normais). */
export function describeRoomModifiers(modifiers: RoomModifiers): string[] {
  const lines: string[] = [];
  if (modifiers.extraLives > 0) lines.push(`+${modifiers.extraLives} ${modifiers.extraLives === 1 ? 'vida' : 'vidas'}`);
  if (modifiers.extraPreparationSeconds > 0) lines.push(`+${modifiers.extraPreparationSeconds}s de preparação`);
  if (modifiers.extraCombatSeconds > 0) lines.push(`+${modifiers.extraCombatSeconds}s de combate`);
  if (modifiers.extraIncome > 0) lines.push(`+${modifiers.extraIncome} de moedas por rodada`);
  if (modifiers.statBonusPercent > 0) lines.push(`+${modifiers.statBonusPercent}% de vida e dano`);
  return lines;
}
