/**
 * Simulador de partidas completas: quatro bots jogam do início ao fim e o relatório mostra a duração das partidas.
 *
 * Uso: npm run sim:games -- --games 200 --seed 1
 */
import { DEFAULT_CHARACTERS } from '../src/data/defaults/characters';
import { INITIAL_SYNERGY_MAPPING } from '../src/data/defaults/synergies';
import { runGameBatch } from '../src/core/game/gameBatch';

function readNumberOption(name: string, fallback: number): number {
  const position = process.argv.indexOf(`--${name}`);
  if (position < 0) {
    return fallback;
  }
  const value = Number(process.argv[position + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Valor inválido para --${name}.`);
  }
  return value;
}

const games = readNumberOption('games', 200);
const seedBase = readNumberOption('seed', 1);

const startedAt = Date.now();
const report = runGameBatch({ games, seedBase, roster: DEFAULT_CHARACTERS, synergyMapping: INITIAL_SYNERGY_MAPPING });

console.log(`\n${games} partidas com 4 bots (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
console.log(`Rodadas por partida: média ${report.averageRounds.toFixed(1)}, máx ${report.maximumRounds}`);
console.log(`Duração média dos combates: ${report.averageCombatSeconds.toFixed(1)}s`);
console.log(`Duração estimada da partida: ~${report.estimatedMinutes.toFixed(1)} min (GDD: 6 a 10 min)`);
console.log(`Partidas travadas: ${report.stalledGames}`);
console.log(`Vitórias por lugar: ${Object.entries(report.winShareBySeat).map(([seat, share]) => `${seat} ${(share * 100).toFixed(0)}%`).join(' | ')}`);
