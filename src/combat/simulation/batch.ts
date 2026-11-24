import type { CharacterDefinition } from '@data/schemas/character';
import { CombatSimulation } from '../engine/CombatSimulation';
import { createRosterScenario, type BonusesBySide } from '../units/scenarios';

export interface BatchOptions {
  readonly characters: readonly CharacterDefinition[];
  readonly matches: number;
  readonly unitsPerSide: number;
  /** Combate `n` usa a semente `seedBase + n`, então o relatório é reproduzível. */
  readonly seedBase: number;
  /** Bônus de sinergia dados a um dos lados (para medir o peso de cada nível). */
  readonly bonusesBySide?: BonusesBySide;
}

export interface CharacterReport {
  readonly characterId: string;
  readonly name: string;
  /** Quantas unidades desse personagem entraram nos combates. */
  readonly appearances: number;
  readonly winRate: number;
  /** Fração das unidades que terminaram o combate vivas. */
  readonly survivalRate: number;
  /** Média de usos da habilidade por unidade por combate. */
  readonly abilityCastsPerAppearance: number;
}

export interface BatchReport {
  readonly matches: number;
  readonly averageDurationSeconds: number;
  readonly medianDurationSeconds: number;
  readonly timeoutRate: number;
  readonly drawRate: number;
  readonly winRateOfSideA: number;
  readonly characters: readonly CharacterReport[];
}

interface Tally {
  appearances: number;
  wins: number;
  survivors: number;
  abilityCasts: number;
}

/** Roda muitos combates com times sorteados do elenco e resume o desempenho de cada personagem. */
export function runBatch(options: BatchOptions): BatchReport {
  const tallies = new Map<string, Tally>(options.characters.map((character) => [character.id, { appearances: 0, wins: 0, survivors: 0, abilityCasts: 0 }]));
  const durationsSeconds: number[] = [];
  let timeouts = 0;
  let draws = 0;
  let winsOfSideA = 0;

  for (let match = 0; match < options.matches; match++) {
    const seed = options.seedBase + match;
    const units = createRosterScenario(seed, options.characters, options.unitsPerSide, options.bonusesBySide);
    const simulation = new CombatSimulation({ seed, units });
    const result = simulation.run();

    durationsSeconds.push(result.durationMs / 1000);
    if (result.reason === 'timeout') timeouts++;
    if (result.winner === 'draw') draws++;
    if (result.winner === 'A') winsOfSideA++;

    const characterOfUnit = new Map(units.map((unit) => [unit.id, { characterId: unit.characterId!, side: unit.side }]));
    const survivorIds = new Set(result.survivors.map((survivor) => survivor.unitId));
    for (const [unitId, { characterId, side }] of characterOfUnit) {
      const tally = tallies.get(characterId)!;
      tally.appearances++;
      if (result.winner === side) tally.wins++;
      if (survivorIds.has(unitId)) tally.survivors++;
    }
    for (const event of simulation.drainEvents()) {
      if (event.type === 'ability') tallies.get(characterOfUnit.get(event.casterId)!.characterId)!.abilityCasts++;
    }
  }

  return {
    matches: options.matches,
    averageDurationSeconds: average(durationsSeconds),
    medianDurationSeconds: median(durationsSeconds),
    timeoutRate: timeouts / options.matches,
    drawRate: draws / options.matches,
    winRateOfSideA: winsOfSideA / options.matches,
    characters: options.characters.map((character) => toCharacterReport(character, tallies.get(character.id)!)),
  };
}

function toCharacterReport(character: CharacterDefinition, tally: Tally): CharacterReport {
  const appearances = Math.max(tally.appearances, 1);
  return {
    characterId: character.id,
    name: character.name,
    appearances: tally.appearances,
    winRate: tally.wins / appearances,
    survivalRate: tally.survivors / appearances,
    abilityCastsPerAppearance: tally.abilityCasts / appearances,
  };
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)]!;
}
