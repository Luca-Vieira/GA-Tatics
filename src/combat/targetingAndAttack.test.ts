import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { attackOf, type AttackDefinition } from '@data/schemas/attack';
import { BOARD_CELLS, cellsOfSide, mirrorCell } from '@shared/constants/board';
import { canAttackFrom } from '@shared/utils/attackArea';
import { hexDistance, hexNeighbors, offsetToAxial, type Hex } from '@shared/utils/hex';
import { SeededRandom } from '@shared/utils/random';
import { CombatSimulation } from './engine/CombatSimulation';
import type { CombatEvent } from './engine/events';
import { selectTarget } from './targeting/targeting';
import { createCombatUnit } from './units/createCombatUnit';
import { unitSpecFromCharacter } from './units/fromCharacter';
import { inspectCombatUnit } from './units/inspect';
import type { BaseStats } from './units/stats';
import type { CombatUnit, UnitSpec } from './units/unit';

const cellAt = (column: number, row: number): Hex => offsetToAxial({ column, row });

function dummy(id: string, side: 'A' | 'B', cell: Hex, stats: Partial<BaseStats> = {}, extra: Partial<UnitSpec> = {}): UnitSpec {
  return { id, name: 'Boneco', side, cell, stats: { health: 10, damage: 1, attackSpeed: 5, range: 1, mobility: 5, ...stats }, ...extra };
}

function characterSpec(characterId: string, id: string, side: 'A' | 'B', cell: Hex): UnitSpec {
  const character = DEFAULT_CHARACTERS.find((candidate) => candidate.id === characterId)!;
  return unitSpecFromCharacter(character, { id, side, cell });
}

function unitOf(simulation: CombatSimulation, id: string): CombatUnit {
  return simulation.units.find((candidate) => candidate.id === id)!;
}

function stepUntil(simulation: CombatSimulation, timeMs: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  while (!simulation.isFinished && simulation.timeMs < timeMs) {
    simulation.step();
    events.push(...simulation.drainEvents());
  }
  return events;
}

const attacksBy = (events: readonly CombatEvent[], unitId: string) =>
  events.filter((event): event is Extract<CombatEvent, { type: 'attack' }> => event.type === 'attack' && event.attackerId === unitId);

const attack = (shape: AttackDefinition['shape'], maxTargets = 1, splashDamageFraction = 0.5): AttackDefinition => ({ shape, maxTargets, splashDamageFraction });

describe('ninguém fica perdido enquanto há inimigo vivo', () => {
  it('com o alvo cercado e fora de alcance, troca para um inimigo alcançável', () => {
    const lockedCell = cellAt(2, 6);
    const surroundingAllies = hexNeighbors(lockedCell).map((cell, position) => dummy(`A${position + 2}`, 'A', cell));
    const simulation = new CombatSimulation({
      seed: 1,
      units: [dummy('A1', 'A', cellAt(0, 1)), ...surroundingAllies, dummy('B1', 'B', lockedCell), dummy('B2', 'B', cellAt(4, 10))],
    });
    // Todos os aliados ficam parados em volta de B1, que por isso não tem nenhuma casa de ataque livre.
    for (const ally of surroundingAllies) {
      unitOf(simulation, ally.id).nextMoveAtMs = Infinity;
    }
    unitOf(simulation, 'B1').nextMoveAtMs = Infinity;
    unitOf(simulation, 'B2').nextMoveAtMs = Infinity;
    unitOf(simulation, 'A1').targetId = 'B1';

    const events = stepUntil(simulation, 20_000);
    expect(attacksBy(events, 'A1').some((event) => event.targetId === 'B2')).toBe(true);
  });

  it('sem nenhuma casa de ataque alcançável, chega o mais perto que consegue', () => {
    const lockedCell = cellAt(2, 9);
    const wall = hexNeighbors(lockedCell).map((cell, position) => dummy(`A${position + 2}`, 'A', cell, { damage: 1 }, { isStructure: true }));
    const simulation = new CombatSimulation({ seed: 1, units: [dummy('A1', 'A', cellAt(2, 0)), ...wall, dummy('B1', 'B', lockedCell)] });
    unitOf(simulation, 'B1').nextMoveAtMs = Infinity;
    const startDistance = hexDistance(cellAt(2, 0), lockedCell);
    stepUntil(simulation, 15_000);
    expect(hexDistance(unitOf(simulation, 'A1').cell, lockedCell)).toBeLessThan(startDistance);
    expect(hexDistance(unitOf(simulation, 'A1').cell, lockedCell)).toBe(2);
  });

  it('quando o alvo sai da área e há outro dentro, troca de alvo', () => {
    const simulation = new CombatSimulation({ seed: 1, units: [dummy('A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4)), dummy('B2', 'B', cellAt(2, 11))] });
    unitOf(simulation, 'A1').targetId = 'B2';
    const events = stepUntil(simulation, 100);
    expect(attacksBy(events, 'A1')[0]?.targetId).toBe('B1');
  });

  it('todo personagem causa dano contra qualquer outro, de várias posições: nenhum formato cria impasse', () => {
    const failures: string[] = [];
    for (const first of DEFAULT_CHARACTERS) {
      for (const second of DEFAULT_CHARACTERS) {
        for (let seed = 0; seed < 3; seed++) {
          const random = new SeededRandom(`${first.id}-${second.id}-${seed}`);
          const [cellOfA] = random.shuffled(cellsOfSide('A'));
          const [cellOfB] = random.shuffled(cellsOfSide('B'));
          const simulation = new CombatSimulation({ seed, units: [characterSpec(first.id, 'A1', 'A', cellOfA!), characterSpec(second.id, 'B1', 'B', cellOfB!)] });
          simulation.run();
          const hurt = simulation.units.filter((unit) => !unit.isSummon && unit.health < unit.stats.maxHealth);
          if (hurt.length === 0) {
            failures.push(`${first.id} x ${second.id} (semente ${seed})`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});

describe('critério "farthest"', () => {
  const sniper = (targetPriority: 'nearest' | 'farthest') =>
    createCombatUnit(dummy('A1', 'A', cellAt(2, 2), { range: 1 }, { behavior: { movement: 'chase', targetPriority, preferredDistance: 1 } }));
  const enemies = () => [createCombatUnit(dummy('B1', 'B', cellAt(2, 6))), createCombatUnit(dummy('B2', 'B', cellAt(2, 11)))];

  it('escolhe o inimigo mais distante', () => {
    expect(selectTarget(sniper('farthest'), enemies())?.id).toBe('B2');
    expect(selectTarget(sniper('nearest'), enemies())?.id).toBe('B1');
  });

  it('segue até o mais distante antes de trocar por quem passa na área', () => {
    const behavior = { movement: 'chase', targetPriority: 'farthest', preferredDistance: 1 } as const;
    const simulation = new CombatSimulation({
      seed: 1,
      units: [dummy('A1', 'A', cellAt(2, 3), {}, { behavior }), dummy('B1', 'B', cellAt(2, 4)), dummy('B2', 'B', cellAt(2, 11))],
    });
    unitOf(simulation, 'B1').nextMoveAtMs = Infinity;
    unitOf(simulation, 'B2').nextMoveAtMs = Infinity;
    const events = stepUntil(simulation, 12_000);
    expect(attacksBy(events, 'A1')[0]?.targetId).toBe('B2');
  });
});

describe('formato do ataque no combate', () => {
  it('quem ataca em linha precisa sair de lado antes de bater, e o evento leva formato, orientação e casas', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [dummy('A1', 'A', cellAt(1, 5), {}, { attack: attack('front_line') }), dummy('B1', 'B', cellAt(2, 5))],
    });
    unitOf(simulation, 'B1').nextMoveAtMs = Infinity;
    expect(canAttackFrom(cellAt(1, 5), cellAt(2, 5), 'front_line', 1, 'A')).toBe(false);
    const events = stepUntil(simulation, 4000);
    expect(events.find((event) => event.type === 'move' && event.unitId === 'A1')).toBeDefined();
    const [firstAttack] = attacksBy(events, 'A1');
    expect(firstAttack?.shape).toBe('front_line');
    expect(firstAttack?.areaCells.some((cell) => cell.q === cellAt(2, 5).q && cell.r === 5)).toBe(true);
    expect(firstAttack?.facing).toBe(unitOf(simulation, 'A1').facing);
  });

  it('com mais de um alvo, os extras recebem a fração configurada, como dano de área', () => {
    const center = cellAt(2, 5);
    const frontCells = hexNeighbors(center).filter((cell) => cell.r === 6);
    const simulation = new CombatSimulation({
      seed: 1,
      units: [
        dummy('A1', 'A', center, { damage: 10 }, { attack: attack('semicircle', 2, 0.4) }),
        dummy('B1', 'B', frontCells[0]!),
        dummy('B2', 'B', frontCells[1]!),
      ],
    });
    const events = stepUntil(simulation, 50);
    const [mainHit] = attacksBy(events, 'A1');
    const splash = events.find((event) => event.type === 'damage' && event.cause === 'splash' && event.sourceId === 'A1');
    expect(mainHit?.damage).toBeCloseTo(100);
    expect(splash).toMatchObject({ amount: 40 });
  });

  it('a orientação acompanha o alvo, mesmo atrás de quem olha', () => {
    const simulation = new CombatSimulation({ seed: 1, units: [dummy('A1', 'A', cellAt(2, 8), {}, { attack: attack('front_line') }), dummy('B1', 'B', cellAt(2, 7))] });
    expect(unitOf(simulation, 'A1').facing).toBe('toB');
    stepUntil(simulation, 50);
    expect(unitOf(simulation, 'A1').facing).toBe('toA');
  });

  it('a maioria dos personagens tem área menor que um círculo completo', () => {
    const restricted = DEFAULT_CHARACTERS.filter((character) => attackOf(character).shape !== 'circle');
    expect(restricted.length).toBeGreaterThan(DEFAULT_CHARACTERS.length / 2);
  });

  it('os formatos são equivalentes nos dois lados (tabuleiro espelhado)', () => {
    expect(BOARD_CELLS.every((cell) => mirrorCell(mirrorCell(cell)).q === cell.q)).toBe(true);
  });
});

describe('Gustavo — cavalos invocados na hora', () => {
  it('invoca dois cavalos sem armadilha, junto dele, e eles carregam a chave do sprite', () => {
    const simulation = new CombatSimulation({ seed: 2, units: [characterSpec('gustavo', 'A1', 'A', cellAt(2, 4)), dummy('B1', 'B', cellAt(2, 8))] });
    const events: CombatEvent[] = [];
    while (!simulation.isFinished && !events.some((event) => event.type === 'spawn')) {
      simulation.step();
      events.push(...simulation.drainEvents());
    }
    const spawns = events.filter((event) => event.type === 'spawn');
    expect(spawns).toHaveLength(2);
    expect(spawns.every((event) => event.type === 'spawn' && event.auxiliarySpriteKey === 'cavalo' && event.ownerId === 'A1')).toBe(true);
    expect(events.some((event) => event.type === 'trap')).toBe(false);
    const gustavoCell = unitOf(simulation, 'A1').cell;
    expect(spawns.every((event) => event.type === 'spawn' && hexDistance(event.cell, gustavoCell) <= 2)).toBe(true);
  });
});

describe('consulta durante o combate', () => {
  it('mostra atributos atuais, área e estados da unidade', () => {
    const simulation = new CombatSimulation({ seed: 1, units: [characterSpec('wender', 'A1', 'A', cellAt(2, 5)), dummy('B1', 'B', cellAt(2, 6))] });
    const unit = unitOf(simulation, 'A1');
    unit.statuses.push({ kind: 'damage_boost', sourceId: 'A1', endsAtMs: 3000, value: 0.4, tickMs: null, nextTickAtMs: Infinity, chargesLeft: null, healRatio: 0 });
    const inspection = inspectCombatUnit(unit, 1000);
    expect(inspection.damage).toBeCloseTo(inspection.baseDamage * 1.4);
    expect(inspection.statuses).toEqual([{ kind: 'damage_boost', label: 'Dano aumentado', remainingSeconds: 2 }]);
    expect(inspection.attackAreaCells.length).toBeGreaterThan(0);
    expect(inspection.attackDescription).toContain('alcance');
  });
});
