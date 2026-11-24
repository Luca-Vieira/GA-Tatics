import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { offsetToAxial, type Hex } from '@shared/utils/hex';
import { CombatSimulation } from '../engine/CombatSimulation';
import type { CombatEvent } from '../engine/events';
import { NO_BONUSES, type TeamBonuses } from './bonuses';
import { unitSpecFromCharacter } from './fromCharacter';
import { HEALTH_PER_POINT } from './stats';
import type { UnitSpec } from './unit';

const cellAt = (column: number, row: number): Hex => offsetToAxial({ column, row });

function dummy(id: string, side: 'A' | 'B', cell: Hex, bonuses?: TeamBonuses, health = 10): UnitSpec {
  return { id, name: 'Boneco', side, cell, stats: { health, damage: 1, attackSpeed: 1, range: 1, mobility: 1 }, bonuses };
}

function character(characterId: string, id: string, side: 'A' | 'B', cell: Hex, bonuses?: TeamBonuses): UnitSpec {
  const definition = DEFAULT_CHARACTERS.find((candidate) => candidate.id === characterId)!;
  return unitSpecFromCharacter(definition, { id, side, cell, bonuses });
}

function runUntil(simulation: CombatSimulation, timeMs: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  while (!simulation.isFinished && simulation.timeMs < timeMs) {
    simulation.step();
    events.push(...simulation.drainEvents());
  }
  return events;
}

function pin(simulation: CombatSimulation): void {
  simulation.units.forEach((unit) => {
    unit.nextMoveAtMs = Infinity;
  });
}

const attacks = (events: readonly CombatEvent[]) => events.filter((event): event is Extract<CombatEvent, { type: 'attack' }> => event.type === 'attack');

describe('bônus de equipe no combate', () => {
  it('multiplicadores estáticos de dano e velocidade de ataque entram nos atributos', () => {
    const boosted = new CombatSimulation({ seed: 1, units: [dummy('A1', 'A', cellAt(2, 3), { ...NO_BONUSES, damageMultiplier: 2, attackSpeedMultiplier: 1.5 }), dummy('B1', 'B', cellAt(2, 4))] });
    const plain = new CombatSimulation({ seed: 1, units: [dummy('A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4))] });
    const boostedUnit = boosted.units.find((unit) => unit.id === 'A1')!;
    const plainUnit = plain.units.find((unit) => unit.id === 'A1')!;
    expect(boostedUnit.stats.damage).toBeCloseTo(plainUnit.stats.damage * 2);
    expect(boostedUnit.stats.attacksPerSecond).toBeCloseTo(plainUnit.stats.attacksPerSecond * 1.5);
  });

  it('a resistência reduz o dano recebido', () => {
    const simulation = new CombatSimulation({ seed: 1, units: [dummy('A1', 'A', cellAt(2, 3), { ...NO_BONUSES, resistance: 0.5 }), dummy('B1', 'B', cellAt(2, 4))] });
    const [firstHit] = attacks(runUntil(simulation, 2000)).filter((event) => event.targetId === 'A1');
    // Dano 10 do boneco, metade absorvida pela resistência.
    expect(firstHit!.damage).toBeCloseTo(5);
  });

  it('a regeneração recupera a fração da vida máxima a cada intervalo, só com o tempo simulado', () => {
    const regenerating: TeamBonuses = { ...NO_BONUSES, regenFraction: 0.1, regenIntervalMs: 3000 };
    const simulation = new CombatSimulation({ seed: 1, units: [dummy('A1', 'A', cellAt(0, 0), regenerating), dummy('B1', 'B', cellAt(4, 7))] });
    pin(simulation);
    const unit = simulation.units.find((candidate) => candidate.id === 'A1')!;
    unit.health = 500;
    const events = runUntil(simulation, 9500);
    const heals = events.filter((event): event is Extract<CombatEvent, { type: 'heal' }> => event.type === 'heal' && event.targetId === 'A1');
    expect(heals.map((heal) => heal.timeMs)).toEqual([3000, 6000, 9000]);
    const maximumHealth = 10 * HEALTH_PER_POINT;
    expect(heals[0]!.amount).toBeCloseTo(maximumHealth * 0.1);
    expect(unit.health).toBeCloseTo(500 + 3 * maximumHealth * 0.1);
  });

  it('a redução de recarga encurta o intervalo entre usos da habilidade', () => {
    function gapBetweenCasts(cooldownReduction: number): number {
      const simulation = new CombatSimulation({
        seed: 1,
        units: [character('felipao', 'A1', 'A', cellAt(2, 3), { ...NO_BONUSES, cooldownReduction }), dummy('B1', 'B', cellAt(2, 5), undefined, 100)],
      });
      pin(simulation);
      const casts = runUntil(simulation, 20_000).filter((event) => event.type === 'ability');
      return casts[1]!.timeMs - casts[0]!.timeMs;
    }
    expect(gapBetweenCasts(0)).toBeGreaterThanOrEqual(6000);
    expect(gapBetweenCasts(0)).toBeLessThan(6100);
    expect(gapBetweenCasts(0.5)).toBeGreaterThanOrEqual(3000);
    expect(gapBetweenCasts(0.5)).toBeLessThan(3100);
  });

  it('a amplificação de efeitos positivos fortalece a cura', () => {
    function firstHealAmount(positiveEffectAmplification: number): number {
      const simulation = new CombatSimulation({
        seed: 1,
        units: [character('helder', 'A1', 'A', cellAt(2, 3), { ...NO_BONUSES, positiveEffectAmplification }), dummy('A2', 'A', cellAt(3, 3), undefined, 10), dummy('B1', 'B', cellAt(4, 7))],
      });
      pin(simulation);
      simulation.units.find((unit) => unit.id === 'A2')!.health = 100;
      const heal = runUntil(simulation, 4000).find((event) => event.type === 'heal' && event.targetId === 'A2');
      return heal && heal.type === 'heal' ? heal.amount : 0;
    }
    // Helder cura 22% da vida máxima do aliado (vida 10).
    const healWithoutAmplification = 10 * HEALTH_PER_POINT * 0.22;
    expect(firstHealAmount(0)).toBeCloseTo(healWithoutAmplification);
    expect(firstHealAmount(0.25)).toBeCloseTo(healWithoutAmplification * 1.25);
  });

  it('sem bônus, a unidade se comporta como antes', () => {
    const withExplicitNone = new CombatSimulation({ seed: 7, units: [dummy('A1', 'A', cellAt(2, 3), NO_BONUSES), dummy('B1', 'B', cellAt(2, 4))] }).run();
    const withoutBonuses = new CombatSimulation({ seed: 7, units: [dummy('A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4))] }).run();
    expect(withExplicitNone).toEqual(withoutBonuses);
  });
});
