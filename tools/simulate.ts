/**
 * Simulador em lote: roda milhares de combates entre times sorteados do elenco e imprime o desempenho de cada personagem.
 *
 * Uso: npm run sim -- --matches 2000 --units 4 --seed 1
 */
import { DEFAULT_CHARACTERS } from '../src/data/defaults/characters';
import { DEFAULT_SYNERGIES } from '../src/data/defaults/synergies';
import { runBatch } from '../src/combat/simulation/batch';
import type { BonusesBySide } from '../src/combat/units/scenarios';
import { bonusesOfSingleTier } from '../src/core/synergies/synergies';

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

const matches = readNumberOption('matches', 2000);
const unitsPerSide = readNumberOption('units', 4);
const seedBase = readNumberOption('seed', 1);

/** `--tier caos:1` dá ao lado A o nível 2 (índice 1) da sinergia; sem a opção, ninguém tem bônus. */
function readTierBonuses(): BonusesBySide {
  const position = process.argv.indexOf('--tier');
  if (position < 0) {
    return {};
  }
  const [synergyId, tierText] = (process.argv[position + 1] ?? '').split(':');
  const synergy = DEFAULT_SYNERGIES.find((candidate) => candidate.id === synergyId);
  const tierIndex = Number(tierText);
  if (!synergy || !Number.isInteger(tierIndex) || !synergy.tiers[tierIndex]) {
    throw new Error('Use --tier <sinergia>:<índice do nível>, por exemplo --tier caos:1.');
  }
  return { A: bonusesOfSingleTier(synergy, tierIndex) };
}

const startedAt = Date.now();
const report = runBatch({ characters: DEFAULT_CHARACTERS, matches, unitsPerSide, seedBase, bonusesBySide: readTierBonuses() });
const percent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

console.log(`\n${matches} combates, ${unitsPerSide} unidades por lado, semente inicial ${seedBase} (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
console.log(`Duração: média ${report.averageDurationSeconds.toFixed(1)}s, mediana ${report.medianDurationSeconds.toFixed(1)}s`);
console.log(`Tempo limite: ${percent(report.timeoutRate)} | Empates: ${percent(report.drawRate)} | Vitórias do lado A: ${percent(report.winRateOfSideA)}\n`);

console.log(['Personagem'.padEnd(12), 'Aparições'.padStart(10), 'Vitória'.padStart(9), 'Sobrevive'.padStart(10), 'Usos/combate'.padStart(13)].join(' '));
const ranked = [...report.characters].sort((first, second) => second.winRate - first.winRate);
for (const character of ranked) {
  console.log(
    [
      character.name.padEnd(12),
      String(character.appearances).padStart(10),
      percent(character.winRate).padStart(9),
      percent(character.survivalRate).padStart(10),
      character.abilityCastsPerAppearance.toFixed(2).padStart(13),
    ].join(' '),
  );
}
