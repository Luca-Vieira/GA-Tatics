import type { CharacterDefinition } from '@data/schemas/character';
import { playMatchWithBots } from './botMatch';
import { Game } from './Game';
import type { SynergyMapping } from '../synergies/synergies';

export interface GameBatchOptions {
  readonly games: number;
  /** Partida `n` usa a semente `lote-<seedBase>-<n>`, então o relatório é reproduzível. */
  readonly seedBase: number;
  readonly roster: readonly CharacterDefinition[];
  readonly synergyMapping: SynergyMapping;
  readonly playerCount?: number;
}

export interface GameBatchReport {
  readonly games: number;
  readonly averageRounds: number;
  readonly maximumRounds: number;
  readonly averageCombatSeconds: number;
  /** Partidas que bateram o limite de rodadas sem vencedor. */
  readonly stalledGames: number;
  /** Fração de vitórias de cada lugar (p1, p2…). */
  readonly winShareBySeat: Readonly<Record<string, number>>;
  /** Estimativa do GDD: preparação + combate + resultado, sem contar o botão "Pronto". */
  readonly estimatedMinutes: number;
}

const FIRST_ROUND_WITH_SHORT_PREPARATION = 6;
const LONG_PREPARATION_SECONDS = 40;
const SHORT_PREPARATION_SECONDS = 30;
const RESULT_SECONDS = 5;

/** Joga muitas partidas completas só com bots e resume duração e equilíbrio entre os lugares. */
export function runGameBatch(options: GameBatchOptions): GameBatchReport {
  const players = Array.from({ length: options.playerCount ?? 4 }, (_, index) => ({ id: `p${index + 1}`, name: `p${index + 1}`, isBot: true }));
  const roundCounts: number[] = [];
  const combatSeconds: number[] = [];
  const winsBySeat = new Map<string, number>(players.map((player) => [player.id, 0]));
  let stalledGames = 0;
  let totalSecondsOutsideCombat = 0;

  for (let index = 0; index < options.games; index++) {
    const game = new Game({ seed: `lote-${options.seedBase}-${index}`, roster: options.roster, players, synergyMapping: options.synergyMapping, rotationIndex: 0 });
    const report = playMatchWithBots(game);
    roundCounts.push(report.rounds);
    combatSeconds.push(...report.combatSeconds);
    totalSecondsOutsideCombat += secondsOutsideCombat(report.rounds);
    if (report.winnerId === null) {
      stalledGames++;
    } else {
      winsBySeat.set(report.winnerId, (winsBySeat.get(report.winnerId) ?? 0) + 1);
    }
  }

  const averageRounds = average(roundCounts);
  const averageCombatSeconds = average(combatSeconds);
  const averageSecondsOutsideCombat = totalSecondsOutsideCombat / Math.max(options.games, 1);
  return {
    games: options.games,
    averageRounds,
    maximumRounds: Math.max(0, ...roundCounts),
    averageCombatSeconds,
    stalledGames,
    winShareBySeat: Object.fromEntries([...winsBySeat].map(([seat, wins]) => [seat, wins / Math.max(options.games, 1)])),
    estimatedMinutes: (averageSecondsOutsideCombat + averageRounds * averageCombatSeconds) / 60,
  };
}

function secondsOutsideCombat(rounds: number): number {
  let total = 0;
  for (let round = 1; round <= rounds; round++) {
    const preparation = round >= FIRST_ROUND_WITH_SHORT_PREPARATION ? SHORT_PREPARATION_SECONDS : LONG_PREPARATION_SECONDS;
    total += preparation + RESULT_SECONDS;
  }
  return total;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}
