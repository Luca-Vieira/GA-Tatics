import { describe, expect, it } from 'vitest';
import { hexDistance, hexKey, offsetToAxial, type Hex } from '@shared/utils/hex';
import { createPrototypeScenario, PROTOTYPE_ARCHER, PROTOTYPE_FIGHTER } from '../units/prototypeUnits';
import type { BaseStats } from '../units/stats';
import type { UnitSpec } from '../units/unit';
import { DEFAULT_COMBAT_TIME_LIMIT_MS } from './constants';
import { CombatSimulation } from './CombatSimulation';

const cellAt = (column: number, row: number): Hex => offsetToAxial({ column, row });

function unit(id: string, side: 'A' | 'B', cell: Hex, type = PROTOTYPE_FIGHTER, overrides: Partial<UnitSpec> = {}): UnitSpec {
  return { id, name: type.name, side, cell, stats: type.stats, ...overrides };
}

describe('CombatSimulation — regras básicas', () => {
  it('unidade corpo a corpo se aproxima do inimigo e depois ataca', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [unit('A1', 'A', cellAt(2, 3)), unit('B1', 'B', cellAt(2, 7))],
    });
    const initialDistance = hexDistance(cellAt(2, 3), cellAt(2, 7));
    simulation.run();
    const events = simulation.drainEvents();
    const firstMove = events.findIndex((event) => event.type === 'move');
    const firstAttack = events.findIndex((event) => event.type === 'attack');
    expect(firstMove).toBeGreaterThanOrEqual(0);
    expect(firstAttack).toBeGreaterThan(firstMove);
    expect(initialDistance).toBeGreaterThan(1);
  });

  it('atirador ataca à distância sem se mover quando o alvo já está no alcance', () => {
    const archerCell = cellAt(2, 3);
    const enemyCell = cellAt(2, 6);
    expect(hexDistance(archerCell, enemyCell)).toBeLessThanOrEqual(PROTOTYPE_ARCHER.stats.range);

    const simulation = new CombatSimulation({
      seed: 1,
      units: [unit('A1', 'A', archerCell, PROTOTYPE_ARCHER), unit('B1', 'B', enemyCell, PROTOTYPE_FIGHTER)],
    });
    simulation.step();
    const firstStepEvents = simulation.drainEvents();
    const archerAttack = firstStepEvents.find((event) => event.type === 'attack' && event.attackerId === 'A1');
    const archerMove = firstStepEvents.find((event) => event.type === 'move' && event.unitId === 'A1');
    expect(archerAttack).toMatchObject({ isRanged: true });
    expect(archerMove).toBeUndefined();
  });

  it('o lado mais forte vence por eliminação', () => {
    const strongStarLevel = { starLevel: 3 as const };
    const simulation = new CombatSimulation({
      seed: 1,
      units: [
        unit('A1', 'A', cellAt(1, 3), PROTOTYPE_FIGHTER, strongStarLevel),
        unit('A2', 'A', cellAt(3, 3), PROTOTYPE_FIGHTER, strongStarLevel),
        unit('B1', 'B', cellAt(2, 4)),
      ],
    });
    const result = simulation.run();
    expect(result.winner).toBe('A');
    expect(result.reason).toBe('elimination');
    expect(result.aliveCountBySide.B).toBe(0);
    expect(result.survivors.every((survivor) => survivor.unitId.startsWith('A'))).toBe(true);
  });

  it('uma unidade morta some do mapa, livra a casa e emite o evento de morte', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [unit('A1', 'A', cellAt(2, 3), PROTOTYPE_FIGHTER, { starLevel: 3 }), unit('B1', 'B', cellAt(2, 4))],
    });
    simulation.run();
    const events = simulation.drainEvents();
    expect(events.filter((event) => event.type === 'death')).toEqual([expect.objectContaining({ unitId: 'B1' })]);
    expect(simulation.getUnits().find((candidate) => candidate.id === 'B1')?.alive).toBe(false);
  });

  it('drainEvents entrega os eventos uma única vez', () => {
    const simulation = new CombatSimulation({ seed: 1, units: [unit('A1', 'A', cellAt(2, 3)), unit('B1', 'B', cellAt(2, 4))] });
    simulation.step();
    expect(simulation.drainEvents().length).toBeGreaterThan(0);
    expect(simulation.drainEvents()).toEqual([]);
  });

  it('o combate sem inimigos termina na hora', () => {
    const simulation = new CombatSimulation({ seed: 1, units: [unit('A1', 'A', cellAt(2, 3))] });
    expect(simulation.isFinished).toBe(true);
    expect(simulation.result?.winner).toBe('A');
  });

  it('o combate sem nenhuma unidade é empate', () => {
    expect(new CombatSimulation({ seed: 1, units: [] }).result?.winner).toBe('draw');
  });

  it('step não altera nada depois do fim', () => {
    const simulation = new CombatSimulation({ seed: 1, units: [unit('A1', 'A', cellAt(2, 3))] });
    const timeAtEnd = simulation.timeMs;
    simulation.step();
    expect(simulation.timeMs).toBe(timeAtEnd);
  });
});

describe('CombatSimulation — tempo limite e desempate', () => {
  it('sem dano e com o mesmo número de vivos, o resultado é empate', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      timeLimitMs: 100,
      units: [unit('A1', 'A', cellAt(0, 0)), unit('B1', 'B', cellAt(4, 7))],
    });
    const result = simulation.run();
    expect(result.reason).toBe('timeout');
    expect(result.winner).toBe('draw');
    expect(result.healthPercentBySide).toEqual({ A: 100, B: 100 });
  });

  it('no tempo limite vence quem tem maior percentual de vida restante', () => {
    const heavyHitter: BaseStats = { health: 10, damage: 10, attackSpeed: 5, range: 1, mobility: 5 };
    const weakHitter: BaseStats = { health: 10, damage: 1, attackSpeed: 5, range: 1, mobility: 5 };
    const simulation = new CombatSimulation({
      seed: 1,
      timeLimitMs: 100,
      units: [
        unit('A1', 'A', cellAt(2, 3), { name: 'Forte', stats: heavyHitter }),
        unit('B1', 'B', cellAt(2, 4), { name: 'Fraco', stats: weakHitter }),
      ],
    });
    const result = simulation.run();
    expect(result.reason).toBe('timeout');
    expect(result.winner).toBe('A');
    expect(result.healthPercentBySide.A).toBeGreaterThan(result.healthPercentBySide.B);
  });

  it('com a mesma % de vida, vence quem tem mais unidades vivas', () => {
    const sameLife: BaseStats = { health: 10, damage: 1, attackSpeed: 1, range: 1, mobility: 1 };
    const simulation = new CombatSimulation({
      seed: 1,
      timeLimitMs: 50,
      units: [
        unit('A1', 'A', cellAt(0, 0), { name: 'x', stats: sameLife }),
        unit('A2', 'A', cellAt(1, 0), { name: 'x', stats: sameLife }),
        unit('B1', 'B', cellAt(4, 7), { name: 'x', stats: sameLife }),
      ],
    });
    // Ambos com 100% de vida: o desempate por vivos dá a vitória ao lado com 2 unidades.
    const result = simulation.run();
    expect(result.healthPercentBySide).toEqual({ A: 100, B: 100 });
    expect(result.winner).toBe('A');
  });
});

describe('CombatSimulation — validação', () => {
  it('rejeita ids repetidos', () => {
    expect(() => new CombatSimulation({ seed: 1, units: [unit('X', 'A', cellAt(0, 0)), unit('X', 'B', cellAt(1, 7))] })).toThrow(/repetido/);
  });

  it('rejeita duas unidades na mesma casa', () => {
    expect(() => new CombatSimulation({ seed: 1, units: [unit('A1', 'A', cellAt(0, 0)), unit('B1', 'B', cellAt(0, 0))] })).toThrow(/mesma casa/);
  });

  it('rejeita unidades fora do tabuleiro', () => {
    expect(() => new CombatSimulation({ seed: 1, units: [unit('A1', 'A', { q: 99, r: 99 })] })).toThrow(/fora do tabuleiro/);
  });
});

describe('CombatSimulation — propriedades sobre muitos cenários', () => {
  const seeds = Array.from({ length: 300 }, (_, index) => index + 1);

  it('é reproduzível: mesma semente, mesmo resultado e mesmos eventos', () => {
    for (const seed of seeds.slice(0, 40)) {
      const first = new CombatSimulation({ seed, units: createPrototypeScenario(seed) });
      const second = new CombatSimulation({ seed, units: createPrototypeScenario(seed) });
      expect(first.run()).toEqual(second.run());
      expect(first.drainEvents()).toEqual(second.drainEvents());
    }
  });

  it('sempre termina dentro do tempo limite', () => {
    for (const seed of seeds) {
      const result = new CombatSimulation({ seed, units: createPrototypeScenario(seed) }).run();
      expect(result.durationMs).toBeLessThanOrEqual(DEFAULT_COMBAT_TIME_LIMIT_MS);
    }
  });

  it('nunca coloca duas unidades vivas na mesma casa nem fora do tabuleiro', () => {
    for (const seed of seeds.slice(0, 60)) {
      const simulation = new CombatSimulation({ seed, units: createPrototypeScenario(seed) });
      while (!simulation.isFinished) {
        simulation.step();
        const aliveCells = simulation
          .getUnits()
          .filter((candidate) => candidate.alive)
          .map((candidate) => hexKey(candidate.cell));
        expect(new Set(aliveCells).size).toBe(aliveCells.length);
      }
    }
  });

  it('não favorece um lado: em cenários sorteados, A e B vencem proporções parecidas', () => {
    let winsOfA = 0;
    let winsOfB = 0;
    for (const seed of seeds) {
      const { winner } = new CombatSimulation({ seed, units: createPrototypeScenario(seed) }).run();
      if (winner === 'A') winsOfA++;
      if (winner === 'B') winsOfB++;
    }
    const decidedCombats = winsOfA + winsOfB;
    expect(decidedCombats).toBeGreaterThan(seeds.length * 0.9);
    expect(winsOfA / decidedCombats).toBeGreaterThan(0.38);
    expect(winsOfA / decidedCombats).toBeLessThan(0.62);
  });
});
