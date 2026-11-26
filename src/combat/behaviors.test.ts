import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { hexDistance, hexKey, offsetToAxial, type Hex } from '@shared/utils/hex';
import { applyStatusToUnit, findStatus, type StatusSpec } from './effects/status';
import { computeModifiers } from './effects/modifiers';
import { DEFAULT_COMBAT_TIME_LIMIT_MS } from './engine/constants';
import { CombatSimulation } from './engine/CombatSimulation';
import { createRosterScenario } from './units/scenarios';
import { findRetreatCell, isTooCloseToEnemies } from './movement/retreat';
import { selectTarget } from './targeting/targeting';
import { createCombatUnit } from './units/createCombatUnit';
import { unitSpecFromCharacter } from './units/fromCharacter';
import type { CombatUnit } from './units/unit';

const cellAt = (column: number, row: number): Hex => offsetToAxial({ column, row });

function unitOfCharacter(characterId: string, id: string, side: 'A' | 'B', cell: Hex): CombatUnit {
  const character = DEFAULT_CHARACTERS.find((candidate) => candidate.id === characterId)!;
  return createCombatUnit(unitSpecFromCharacter(character, { id, side, cell }));
}

const statusSpec = (overrides: Partial<StatusSpec> = {}): StatusSpec => ({
  kind: 'slow',
  durationMs: 3000,
  value: 0.3,
  tickMs: null,
  charges: null,
  healRatio: 0,
  ...overrides,
});

describe('prioridade de alvo', () => {
  it('"nearest" escolhe o inimigo mais próximo, com desempate pelo menor id', () => {
    const bixo = unitOfCharacter('bixo', 'A1', 'A', cellAt(2, 3));
    const near = unitOfCharacter('bixo', 'B2', 'B', cellAt(2, 4));
    const tied = unitOfCharacter('bixo', 'B1', 'B', cellAt(3, 4));
    const far = unitOfCharacter('bixo', 'B3', 'B', cellAt(2, 7));
    expect(selectTarget(bixo, [bixo, near, tied, far])?.id).toBe('B1');
  });

  it('"lowest_health" prefere o inimigo mais ferido dentro do alcance de prioridade', () => {
    const leo = unitOfCharacter('leo', 'A1', 'A', cellAt(2, 3));
    const healthy = unitOfCharacter('bixo', 'B1', 'B', cellAt(2, 4));
    const wounded = unitOfCharacter('bixo', 'B2', 'B', cellAt(3, 5));
    wounded.health = 100;
    expect(selectTarget(leo, [leo, healthy, wounded])?.id).toBe('B2');
  });

  it('"lowest_health" ignora feridos muito longe e cai no mais próximo', () => {
    const leo = unitOfCharacter('leo', 'A1', 'A', cellAt(2, 0));
    const near = unitOfCharacter('bixo', 'B1', 'B', cellAt(2, 3));
    const farWounded = unitOfCharacter('bixo', 'B2', 'B', cellAt(2, 7));
    farWounded.health = 10;
    expect(hexDistance(leo.cell, farWounded.cell)).toBeGreaterThan(leo.stats.range + 2);
    expect(selectTarget(leo, [leo, near, farWounded])?.id).toBe('B1');
  });

  it('"cluster" prefere o inimigo no meio do maior grupo', () => {
    const matheus = unitOfCharacter('matheus', 'A1', 'A', cellAt(2, 2));
    const isolated = unitOfCharacter('bixo', 'B1', 'B', cellAt(4, 4));
    const groupMembers = [cellAt(1, 6), cellAt(2, 6), cellAt(1, 7)].map((cell, position) => unitOfCharacter('bixo', `B${position + 2}`, 'B', cell));
    for (const member of groupMembers) {
      expect(hexDistance(isolated.cell, member.cell)).toBeGreaterThan(2);
    }
    expect(hexDistance(matheus.cell, isolated.cell)).toBeLessThan(hexDistance(matheus.cell, groupMembers[0]!.cell));

    const target = selectTarget(matheus, [matheus, isolated, ...groupMembers]);
    expect(['B2', 'B3', 'B4']).toContain(target?.id);
  });

  it('devolve null quando não há inimigos vivos', () => {
    const bixo = unitOfCharacter('bixo', 'A1', 'A', cellAt(2, 3));
    const dead = unitOfCharacter('bixo', 'B1', 'B', cellAt(2, 4));
    dead.alive = false;
    expect(selectTarget(bixo, [bixo, dead])).toBeNull();
  });
});

describe('recuo dos personagens "kite"', () => {
  it('só quem tem perfil "kite" recua, e só quando o inimigo está mais perto que a distância preferida', () => {
    const felipao = unitOfCharacter('felipao', 'A1', 'A', cellAt(2, 3));
    const closeEnemy = unitOfCharacter('bixo', 'B1', 'B', cellAt(2, 4));
    const farEnemy = unitOfCharacter('bixo', 'B2', 'B', cellAt(2, 7));
    expect(isTooCloseToEnemies(felipao, [closeEnemy])).toBe(true);
    expect(isTooCloseToEnemies(felipao, [farEnemy])).toBe(false);

    const bixo = unitOfCharacter('bixo', 'A2', 'A', cellAt(2, 3));
    expect(isTooCloseToEnemies(bixo, [closeEnemy])).toBe(false);
  });

  it('a casa de recuo é livre, está no tabuleiro e aumenta a distância', () => {
    const felipao = unitOfCharacter('felipao', 'A1', 'A', cellAt(2, 3));
    const enemy = unitOfCharacter('bixo', 'B1', 'B', cellAt(2, 4));
    const retreat = findRetreatCell(felipao, [enemy], () => true);
    expect(retreat).not.toBeNull();
    expect(hexDistance(retreat!, enemy.cell)).toBeGreaterThan(hexDistance(felipao.cell, enemy.cell));
  });

  it('encurralado (nenhuma casa livre melhora a distância), não recua', () => {
    const felipao = unitOfCharacter('felipao', 'A1', 'A', cellAt(2, 3));
    const enemy = unitOfCharacter('bixo', 'B1', 'B', cellAt(2, 4));
    expect(findRetreatCell(felipao, [enemy], () => false)).toBeNull();
  });

  it('no combate, um atirador contra um lutador recua e abre espaço', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [
        unitSpecFromCharacter(DEFAULT_CHARACTERS.find((character) => character.id === 'felipao')!, { id: 'A1', side: 'A', cell: cellAt(2, 1) }),
        unitSpecFromCharacter(DEFAULT_CHARACTERS.find((character) => character.id === 'bixo')!, { id: 'B1', side: 'B', cell: cellAt(2, 4) }),
      ],
    });
    const events: string[] = [];
    while (!simulation.isFinished && simulation.timeMs < 4000) {
      simulation.step();
      simulation.drainEvents().forEach((event) => events.push(event.type));
    }
    expect(events).toContain('move');
    const felipao = simulation.units.find((unit) => unit.id === 'A1')!;
    expect(felipao.alive).toBe(true);
  });
});

describe('estados temporários', () => {
  it('reaplicar o mesmo estado renova a duração e mantém a maior intensidade, sem acumular', () => {
    const unit = unitOfCharacter('bixo', 'A1', 'A', cellAt(2, 3));
    applyStatusToUnit(unit, 'B1', statusSpec({ value: 0.3, durationMs: 3000 }), 0);
    applyStatusToUnit(unit, 'B1', statusSpec({ value: 0.2, durationMs: 3000 }), 1000);
    expect(unit.statuses).toHaveLength(1);
    expect(findStatus(unit, 'slow')).toMatchObject({ value: 0.3, endsAtMs: 4000 });
  });

  it('lentidão reduz velocidade de ataque e de movimento; aceleração aumenta', () => {
    const unit = unitOfCharacter('bixo', 'A1', 'A', cellAt(2, 3));
    applyStatusToUnit(unit, 'B1', statusSpec({ kind: 'slow', value: 0.4 }), 0);
    expect(computeModifiers(unit)).toMatchObject({ attackSpeedMultiplier: 0.6, moveSpeedMultiplier: 0.6 });
    applyStatusToUnit(unit, 'B1', statusSpec({ kind: 'speed_boost', value: 0.5 }), 0);
    expect(computeModifiers(unit).moveSpeedMultiplier).toBeCloseTo(1.5 * 0.6);
  });

  it('sono e descanso impedem qualquer ação', () => {
    const unit = unitOfCharacter('bixo', 'A1', 'A', cellAt(2, 3));
    expect(computeModifiers(unit).canAct).toBe(true);
    applyStatusToUnit(unit, 'B1', statusSpec({ kind: 'sleep', value: 0 }), 0);
    expect(computeModifiers(unit).canAct).toBe(false);
  });

  it('a redução de habilidade entra em computeModifiers', () => {
    const unit = unitOfCharacter('bixo', 'A1', 'A', cellAt(2, 3));
    applyStatusToUnit(unit, 'A1', statusSpec({ kind: 'damage_reduction', value: 0.7 }), 0);
    expect(computeModifiers(unit).damageReduction).toBe(0.7);
  });
});

describe('elenco completo em combate', () => {
  const seeds = Array.from({ length: 120 }, (_, index) => index + 1);
  const abilityNamesSeen = new Set<string>();

  it('é reproduzível: mesma semente, mesmos eventos e resultado, com todas as habilidades', () => {
    for (const seed of seeds.slice(0, 30)) {
      const first = new CombatSimulation({ seed, units: createRosterScenario(seed, DEFAULT_CHARACTERS) });
      const second = new CombatSimulation({ seed, units: createRosterScenario(seed, DEFAULT_CHARACTERS) });
      expect(first.run()).toEqual(second.run());
      expect(first.drainEvents()).toEqual(second.drainEvents());
    }
  });

  it('sempre termina no tempo limite, sem casas repetidas e sem vida fora dos limites', () => {
    for (const seed of seeds) {
      const simulation = new CombatSimulation({ seed, units: createRosterScenario(seed, DEFAULT_CHARACTERS, 5) });
      while (!simulation.isFinished) {
        simulation.step();
        simulation.drainEvents().forEach((event) => {
          if (event.type === 'ability') abilityNamesSeen.add(event.abilityName);
        });
        const alive = simulation.units.filter((unit) => unit.alive);
        expect(new Set(alive.map((unit) => hexKey(unit.cell))).size).toBe(alive.length);
        for (const unit of simulation.units) {
          expect(unit.health).toBeGreaterThanOrEqual(0);
          expect(unit.health).toBeLessThanOrEqual(unit.stats.maxHealth + 1e-9);
        }
      }
      expect(simulation.result!.durationMs).toBeLessThanOrEqual(DEFAULT_COMBAT_TIME_LIMIT_MS);
    }
  }, 60_000);

  it('as 11 habilidades ativas aparecem nos combates sorteados', () => {
    const expected = DEFAULT_CHARACTERS.filter((character) => character.ability.activation.type !== 'passive').map((character) => character.ability.name);
    expect(expected).toHaveLength(11);
    for (const name of expected) {
      expect(abilityNamesSeen, `habilidade "${name}" nunca foi usada`).toContain(name);
    }
  });

  it('nenhum lado tem vantagem sistemática por ser A ou B', () => {
    let winsOfA = 0;
    let winsOfB = 0;
    for (const seed of seeds) {
      const { winner } = new CombatSimulation({ seed, units: createRosterScenario(seed, DEFAULT_CHARACTERS) }).run();
      if (winner === 'A') winsOfA++;
      if (winner === 'B') winsOfB++;
    }
    const decided = winsOfA + winsOfB;
    expect(winsOfA / decided).toBeGreaterThan(0.38);
    expect(winsOfA / decided).toBeLessThan(0.62);
  });
});
