import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { hexDistance, hexNeighbors, offsetToAxial, type Hex } from '@shared/utils/hex';
import { SeededRandom } from '@shared/utils/random';
import { computeModifiers } from '../effects/modifiers';
import { CombatSimulation } from '../engine/CombatSimulation';
import type { CombatEvent } from '../engine/events';
import { createCombatUnit } from '../units/createCombatUnit';
import { unitSpecFromCharacter } from '../units/fromCharacter';
import { HEALTH_PER_POINT, type BaseStats } from '../units/stats';
import type { CombatUnit, UnitSpec } from '../units/unit';
import { rollRandomAttack } from './registeredBehaviors';

const cellAt = (column: number, row: number): Hex => offsetToAxial({ column, row });

function characterSpec(characterId: string, id: string, side: 'A' | 'B', cell: Hex, starLevel?: 1 | 2 | 3): UnitSpec {
  const character = DEFAULT_CHARACTERS.find((candidate) => candidate.id === characterId);
  if (!character) throw new Error(`Personagem inexistente: ${characterId}`);
  return unitSpecFromCharacter(character, { id, side, cell, starLevel });
}

/** Unidade genérica para montar cenários: por padrão aguenta muito e bate pouco. */
function dummy(id: string, side: 'A' | 'B', cell: Hex, stats: Partial<BaseStats> = {}): UnitSpec {
  return { id, name: 'Boneco', side, cell, stats: { health: 10, damage: 1, attackSpeed: 1, range: 1, mobility: 1, ...stats } };
}

function stepUntil(simulation: CombatSimulation, timeMs: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  while (!simulation.isFinished && simulation.timeMs < timeMs) {
    simulation.step();
    events.push(...simulation.drainEvents());
  }
  return events;
}

function ofType<Type extends CombatEvent['type']>(events: readonly CombatEvent[], type: Type): Extract<CombatEvent, { type: Type }>[] {
  return events.filter((event): event is Extract<CombatEvent, { type: Type }> => event.type === type);
}

function unitOf(simulation: CombatSimulation, id: string): CombatUnit {
  const unit = simulation.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`Unidade inexistente: ${id}`);
  return unit;
}

/** Impede as unidades de andar, para o cenário montado não se desfazer antes da habilidade ser usada. */
function pinInPlace(simulation: CombatSimulation, ...ids: string[]): void {
  for (const id of ids) {
    unitOf(simulation, id).nextMoveAtMs = Infinity;
  }
}

/** Três casas mutuamente adjacentes do lado B, para formar um "grupo" de inimigos. */
function enemyTriangle(): [Hex, Hex, Hex] {
  const center = cellAt(2, 5);
  const [first, second] = hexNeighbors(center);
  return [center, first!, second!];
}

describe('Bixo — Descansar, né (limiar de vida)', () => {
  it('ao cair para metade da vida senta (para de atacar) com redução de dano, uma única vez', () => {
    const strongEnemy: Partial<BaseStats> = { damage: 10, attackSpeed: 5, mobility: 5 };
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('bixo', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4), strongEnemy)],
    });
    const events = stepUntil(simulation, 14_000);

    const casts = ofType(events, 'ability').filter((event) => event.casterId === 'A1');
    expect(casts).toHaveLength(1);
    const castTime = casts[0]!.timeMs;

    const appliedStatuses = ofType(events, 'status').filter((event) => event.unitId === 'A1' && event.change === 'applied' && event.timeMs === castTime);
    expect(appliedStatuses.map((event) => event.status).sort()).toEqual(['damage_reduction', 'resting']);

    const bixoAttacksWhileResting = ofType(events, 'attack').filter((event) => event.attackerId === 'A1' && event.timeMs >= castTime && event.timeMs < castTime + 4000);
    expect(bixoAttacksWhileResting).toHaveLength(0);
    const bixoAttacksAfter = ofType(events, 'attack').filter((event) => event.attackerId === 'A1' && event.timeMs >= castTime + 4000);
    expect(bixoAttacksAfter.length).toBeGreaterThan(0);
  });

  it('o dano recebido cai 70% enquanto a postura está ativa', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('bixo', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4))],
    });
    const bixo = unitOf(simulation, 'A1');
    bixo.health = bixo.stats.maxHealth * 0.4;
    const events = stepUntil(simulation, 3000);
    const castTime = ofType(events, 'ability')[0]!.timeMs;
    const hitsAfterCast = ofType(events, 'attack').filter((event) => event.targetId === 'A1' && event.timeMs > castTime);
    expect(hitsAfterCast.length).toBeGreaterThan(0);
    // Boneco: dano 10 → 10; com 70% de redução chega 3.
    expect(hitsAfterCast[0]!.damage).toBeCloseTo(10 * 0.3);
  });
});

describe('Vinícius — Burnout (passivo)', () => {
  const vinicius = (healthFraction: number) => {
    const unit = createCombatUnit(characterSpec('vinicius', 'A1', 'A', cellAt(2, 3)));
    unit.health = unit.stats.maxHealth * healthFraction;
    return computeModifiers(unit);
  };

  it('com a vida cheia não tem bônus', () => {
    expect(vinicius(1)).toMatchObject({ attackSpeedMultiplier: 1, damageMultiplier: 1 });
  });

  it('quanto menos vida, mais rápido ataca', () => {
    expect(vinicius(0.5).attackSpeedMultiplier).toBeCloseTo(1.4);
    expect(vinicius(0.8).attackSpeedMultiplier).toBeLessThan(vinicius(0.5).attackSpeedMultiplier);
  });

  it('abaixo de 30% da vida entra em fúria e causa mais dano', () => {
    expect(vinicius(0.31).damageMultiplier).toBe(1);
    expect(vinicius(0.3).damageMultiplier).toBeCloseTo(1.3);
    expect(vinicius(0.2).attackSpeedMultiplier).toBeCloseTo(1.64);
  });
});

/** Dano de ataque (na escala de jogo) de um personagem, lido do elenco para os testes não travarem o balanceamento. */
function attackDamageOf(characterId: string): number {
  return 10 * DEFAULT_CHARACTERS.find((candidate) => candidate.id === characterId)!.stats.damage;
}

describe('Leo — Errinho na sexta à tarde (primeiro golpe)', () => {
  it('o primeiro golpe em cada alvo causa dano crítico e confunde, e não se repete no mesmo alvo', () => {
    const simulation = new CombatSimulation({
      seed: 3,
      units: [characterSpec('leo', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4))],
    });
    const events = stepUntil(simulation, 4000);

    expect(ofType(events, 'ability').filter((event) => event.casterId === 'A1')).toHaveLength(1);
    const firstAttack = ofType(events, 'attack').find((event) => event.attackerId === 'A1')!;
    const criticalBonus = ofType(events, 'damage').find((event) => event.cause === 'ability' && event.sourceId === 'A1')!;
    expect(firstAttack.damage).toBeCloseTo(attackDamageOf('leo'));
    expect(criticalBonus.amount).toBeCloseTo(attackDamageOf('leo') * 1.5);
    expect(criticalBonus.timeMs).toBe(firstAttack.timeMs);

    const confusionApplied = ofType(events, 'status').filter((event) => event.unitId === 'B1' && event.status === 'confuse' && event.change === 'applied');
    expect(confusionApplied).toHaveLength(1);
  });

  it('a confusão gasta uma carga no próximo ataque do inimigo e some', () => {
    const simulation = new CombatSimulation({
      seed: 3,
      units: [characterSpec('leo', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4))],
    });
    const events = stepUntil(simulation, 3000);
    const expired = ofType(events, 'status').filter((event) => event.unitId === 'B1' && event.status === 'confuse' && event.change === 'expired');
    expect(expired).toHaveLength(1);
  });

  it('cada alvo novo recebe a emboscada', () => {
    const simulation = new CombatSimulation({
      seed: 3,
      units: [characterSpec('leo', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4), { health: 3 }), dummy('B2', 'B', cellAt(3, 4), { health: 10 })],
    });
    const events = stepUntil(simulation, 5000);
    const targetsAmbushed = new Set(ofType(events, 'status').filter((event) => event.status === 'confuse' && event.change === 'applied').map((event) => event.unitId));
    expect(targetsAmbushed.size).toBeGreaterThanOrEqual(2);
  });
});

describe('Marquinhos — Olhar penetrante (drenagem)', () => {
  it('drena o alvo em pulsos e recupera a própria vida', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('marquinhos', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4))],
    });
    unitOf(simulation, 'A1').health = 100;
    const events = stepUntil(simulation, 6000);

    const drainPulses = ofType(events, 'damage').filter((event) => event.cause === 'drain' && event.targetId === 'B1');
    expect(drainPulses.length).toBeGreaterThanOrEqual(5);
    expect(drainPulses[0]!.amount).toBeCloseTo(60 * 0.7);

    const heals = ofType(events, 'heal').filter((event) => event.targetId === 'A1' && event.sourceId === 'A1');
    expect(heals.length).toBeGreaterThanOrEqual(5);
    expect(heals[0]!.amount).toBeCloseTo(drainPulses[0]!.amount);
  });

  it('a drenagem ignora a resistência do alvo', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('marquinhos', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4))],
    });
    unitOf(simulation, 'B1').resistance = 0.5;
    const events = stepUntil(simulation, 2500);
    const firstPulse = ofType(events, 'damage').find((event) => event.cause === 'drain')!;
    expect(firstPulse.amount).toBeCloseTo(60 * 0.7);
  });
});

describe('Felipão — Chuva de cubo mágico (dano em área)', () => {
  it('atinge todos os inimigos do grupo de uma só vez', () => {
    const [center, first, second] = enemyTriangle();
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('felipao', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', center), dummy('B2', 'B', first), dummy('B3', 'B', second)],
    });
    pinInPlace(simulation, 'B1', 'B2', 'B3');
    const events = stepUntil(simulation, 3000);
    const cast = ofType(events, 'ability').find((event) => event.casterId === 'A1')!;
    expect(cast.radius).toBe(1);
    const rainHits = ofType(events, 'damage').filter((event) => event.cause === 'ability' && event.timeMs === cast.timeMs);
    expect(new Set(rainHits.map((event) => event.targetId))).toEqual(new Set(['B1', 'B2', 'B3']));
    expect(rainHits[0]!.amount).toBeCloseTo(50 * 1.4);
  });

  it('mira o centro do maior grupo, não o inimigo isolado mais próximo', () => {
    const [center, first, second] = enemyTriangle();
    const loneEnemyCell = cellAt(0, 4);
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('felipao', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', loneEnemyCell), dummy('B2', 'B', center), dummy('B3', 'B', first), dummy('B4', 'B', second)],
    });
    pinInPlace(simulation, 'B1', 'B2', 'B3', 'B4');
    const events = stepUntil(simulation, 3000);
    const cast = ofType(events, 'ability').find((event) => event.casterId === 'A1')!;
    const rainHits = ofType(events, 'damage').filter((event) => event.cause === 'ability' && event.timeMs === cast.timeMs);
    expect(rainHits.length).toBe(3);
    expect(rainHits.some((event) => event.targetId === 'B1')).toBe(false);
  });
});

describe('João Lucas — Faz o L poderoso (projétil em L)', () => {
  it('acerta o alvo e muda de direção para um segundo inimigo próximo', () => {
    const primaryCell = cellAt(2, 5);
    const secondaryCell = hexNeighbors(primaryCell)[0]!;
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('joao_lucas', 'A1', 'A', cellAt(2, 2)), dummy('B1', 'B', primaryCell), dummy('B2', 'B', secondaryCell)],
    });
    const events = stepUntil(simulation, 3000);
    const cast = ofType(events, 'ability').find((event) => event.casterId === 'A1')!;
    const sameStep = (event: CombatEvent) => event.timeMs === cast.timeMs;

    const projectiles = ofType(events, 'projectile').filter(sameStep);
    expect(projectiles).toHaveLength(2);
    expect(projectiles[0]!.fromId).toBe('A1');
    expect(projectiles[1]!.fromId).toBe(projectiles[0]!.toId);

    const hits = ofType(events, 'damage').filter((event) => event.cause === 'ability' && sameStep(event));
    expect(hits.map((hit) => hit.amount)).toEqual([expect.closeTo(attackDamageOf('joao_lucas') * 2.5), expect.closeTo(attackDamageOf('joao_lucas') * 2)]);
    expect(new Set(hits.map((hit) => hit.targetId)).size).toBe(2);
  });

  it('sem um segundo inimigo por perto, só o alvo é atingido', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('joao_lucas', 'A1', 'A', cellAt(2, 2)), dummy('B1', 'B', cellAt(2, 5))],
    });
    const events = stepUntil(simulation, 3000);
    const cast = ofType(events, 'ability').find((event) => event.casterId === 'A1')!;
    const hits = ofType(events, 'damage').filter((event) => event.cause === 'ability' && event.timeMs === cast.timeMs);
    expect(hits).toHaveLength(1);
    expect(ofType(events, 'projectile').filter((event) => event.timeMs === cast.timeMs)).toHaveLength(1);
  });
});

describe('Matheus — Sujeira em área (enfraquecimento e veneno)', () => {
  it('enfraquece todos os inimigos da área e envenena só o do centro', () => {
    const [center, first, second] = enemyTriangle();
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('matheus', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', center), dummy('B2', 'B', first), dummy('B3', 'B', second)],
    });
    pinInPlace(simulation, 'B1', 'B2', 'B3');
    const events = stepUntil(simulation, 5000);
    const cast = ofType(events, 'ability').find((event) => event.casterId === 'A1')!;
    const applied = ofType(events, 'status').filter((event) => event.timeMs === cast.timeMs && event.change === 'applied');

    const weakened = applied.filter((event) => event.status === 'weaken').map((event) => event.unitId);
    const poisoned = applied.filter((event) => event.status === 'poison').map((event) => event.unitId);
    expect(new Set(weakened)).toEqual(new Set(['B1', 'B2', 'B3']));
    expect(poisoned).toHaveLength(1);

    const poisonTicks = ofType(events, 'damage').filter((event) => event.cause === 'poison');
    expect(poisonTicks.length).toBeGreaterThanOrEqual(4);
    expect(poisonTicks.every((event) => event.targetId === poisoned[0])).toBe(true);
    expect(poisonTicks[0]!.amount).toBeCloseTo(attackDamageOf('matheus') * 0.5);
  });

  it('o enfraquecimento reduz o dano do inimigo em 30%', () => {
    const [center, first, second] = enemyTriangle();
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('matheus', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', center), dummy('B2', 'B', first), dummy('B3', 'B', second)],
    });
    pinInPlace(simulation, 'B1', 'B2', 'B3');
    stepUntil(simulation, 2000);
    // Cada inimigo do grupo recebeu o enfraquecimento; confere um deles.
    expect(computeModifiers(unitOf(simulation, 'B1')).damageMultiplier).toBeCloseTo(0.7);
  });
});

describe('Helder — Presença majestosa (cura)', () => {
  const alliesAround = () => [
    characterSpec('helder', 'A1', 'A', cellAt(2, 2)),
    dummy('A2', 'A', cellAt(2, 3)),
    dummy('A3', 'A', cellAt(1, 3)),
    dummy('A4', 'A', cellAt(3, 3)),
    dummy('B1', 'B', cellAt(4, 7)),
  ];

  it('cura os dois aliados mais feridos, na ordem do mais ferido', () => {
    const simulation = new CombatSimulation({ seed: 1, units: alliesAround() });
    unitOf(simulation, 'A2').health = 300;
    unitOf(simulation, 'A3').health = 600;
    unitOf(simulation, 'A4').health = 500;
    const events = stepUntil(simulation, 2000);

    const heals = ofType(events, 'heal').filter((event) => event.sourceId === 'A1');
    expect(heals.map((event) => event.targetId)).toEqual(['A2', 'A4']);
    expect(heals[0]!.amount).toBeCloseTo(10 * HEALTH_PER_POINT * 0.22);
  });

  it('não usa a habilidade quando ninguém está ferido', () => {
    const simulation = new CombatSimulation({ seed: 1, units: alliesAround() });
    const events = stepUntil(simulation, 5000);
    expect(ofType(events, 'ability').filter((event) => event.casterId === 'A1')).toHaveLength(0);
  });

  it('a cura nunca passa da vida máxima', () => {
    const simulation = new CombatSimulation({ seed: 1, units: alliesAround() });
    unitOf(simulation, 'A2').health = 950;
    stepUntil(simulation, 4000);
    expect(unitOf(simulation, 'A2').health).toBeLessThanOrEqual(unitOf(simulation, 'A2').stats.maxHealth);
  });
});

describe('Wilian — Dormir no serviço (sono)', () => {
  it('o alvo dormindo não ataca nem se move durante a duração, e volta depois', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('wilian', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 6), { attackSpeed: 5, mobility: 5 })],
    });
    const events = stepUntil(simulation, 8000);
    const sleepStart = ofType(events, 'status').find((event) => event.unitId === 'B1' && event.status === 'sleep' && event.change === 'applied')!;
    const sleepEnd = ofType(events, 'status').find((event) => event.unitId === 'B1' && event.status === 'sleep' && event.change === 'expired')!;
    expect(sleepEnd.timeMs - sleepStart.timeMs).toBeGreaterThanOrEqual(3000);
    expect(sleepEnd.timeMs - sleepStart.timeMs).toBeLessThan(3100);

    const actsOfB1 = events.filter((event) => (event.type === 'move' && event.unitId === 'B1') || (event.type === 'attack' && event.attackerId === 'B1'));
    const actsWhileAsleep = actsOfB1.filter((event) => event.timeMs >= sleepStart.timeMs && event.timeMs < sleepEnd.timeMs);
    expect(actsWhileAsleep).toHaveLength(0);
    expect(actsOfB1.some((event) => event.timeMs >= sleepEnd.timeMs)).toBe(true);
  });
});

describe('Wender — Tapar buraco (sobrecarga)', () => {
  it('só dispara depois que um aliado cai e aumenta velocidade e dano', () => {
    const simulation = new CombatSimulation({
      seed: 1,
      units: [characterSpec('wender', 'A1', 'A', cellAt(2, 2)), dummy('A2', 'A', cellAt(1, 3)), dummy('B1', 'B', cellAt(4, 7))],
    });
    const beforeFall = stepUntil(simulation, 2500);
    expect(ofType(beforeFall, 'ability').filter((event) => event.casterId === 'A1')).toHaveLength(0);

    simulation.dealDamage(null, unitOf(simulation, 'A2'), 1e9, { cause: 'ability', ignoreMitigation: true });
    const afterFall = stepUntil(simulation, simulation.timeMs + 200);

    expect(ofType(afterFall, 'ability').filter((event) => event.casterId === 'A1')).toHaveLength(1);
    const modifiers = computeModifiers(unitOf(simulation, 'A1'));
    expect(modifiers.damageMultiplier).toBeCloseTo(1.4);
    expect(modifiers.attackSpeedMultiplier).toBeCloseTo(1.5);
    expect(modifiers.moveSpeedMultiplier).toBeCloseTo(1.5);
  });

  it('a invocação que cai não conta como "aliado caído"', () => {
    const simulation = new CombatSimulation({ seed: 1, units: [characterSpec('wender', 'A1', 'A', cellAt(2, 2)), dummy('B1', 'B', cellAt(4, 7))] });
    const events = stepUntil(simulation, 3000);
    expect(ofType(events, 'ability')).toHaveLength(0);
  });
});

describe('Gustavo — Mordida de cavalo (armadilha e invocação)', () => {
  const gustavoVersusDummy = (timeLimitMs?: number) => {
    const simulation = new CombatSimulation({
      seed: 1,
      timeLimitMs,
      units: [characterSpec('gustavo', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 5))],
    });
    pinInPlace(simulation, 'B1');
    return simulation;
  };

  it('planta a armadilha perto do alvo e, ao disparar, invoca dois cavalos', () => {
    const simulation = gustavoVersusDummy();
    const events = stepUntil(simulation, 5000);

    const placed = ofType(events, 'trap').find((event) => event.change === 'placed')!;
    const triggered = ofType(events, 'trap').find((event) => event.change === 'triggered')!;
    expect(hexDistance(placed.cell, cellAt(2, 5))).toBeLessThanOrEqual(1);
    expect(triggered.timeMs - placed.timeMs).toBeGreaterThanOrEqual(500);

    const spawns = ofType(events, 'spawn');
    expect(spawns).toHaveLength(2);
    expect(spawns.every((event) => event.name === 'Cavalo' && event.ownerId === 'A1' && event.side === 'A')).toBe(true);
  });

  it('os cavalos atacam o inimigo e desaparecem depois de 6 segundos', () => {
    const simulation = gustavoVersusDummy();
    const events = stepUntil(simulation, 14_000);
    const horseIds = ofType(events, 'spawn').map((event) => event.unitId);

    expect(ofType(events, 'attack').some((event) => horseIds.includes(event.attackerId))).toBe(true);
    const horseDeaths = ofType(events, 'death').filter((event) => horseIds.includes(event.unitId));
    expect(horseDeaths).toHaveLength(2);
    const spawnTime = ofType(events, 'spawn')[0]!.timeMs;
    expect(horseDeaths.every((event) => event.timeMs === spawnTime + 6000)).toBe(true);
  });

  it('as invocações não aparecem no resultado final', () => {
    const simulation = gustavoVersusDummy(8000);
    const result = simulation.run();
    expect(result.aliveCountBySide.A).toBe(1);
    expect(result.survivors.every((survivor) => !survivor.unitId.includes('~'))).toBe(true);
  });

  it('as invocações não seguram o combate: sem unidades reais, o lado perde', () => {
    const simulation = gustavoVersusDummy();
    while (!simulation.units.some((unit) => unit.isSummon && unit.alive)) simulation.step();
    simulation.dealDamage(null, unitOf(simulation, 'A1'), 1e9, { cause: 'ability', ignoreMitigation: true });
    simulation.step();
    expect(simulation.isFinished).toBe(true);
    expect(simulation.result).toMatchObject({ winner: 'B', reason: 'elimination' });
  });

  it('o cavalo de um Gustavo de 3 estrelas é mais forte', () => {
    const buildSimulation = (starLevel: 1 | 3) =>
      new CombatSimulation({
        seed: 1,
        units: [characterSpec('gustavo', 'A1', 'A', cellAt(2, 3), starLevel), dummy('B1', 'B', cellAt(2, 5))],
      });
    const horseHealth = (starLevel: 1 | 3) => {
      const simulation = buildSimulation(starLevel);
      while (!simulation.units.some((unit) => unit.isSummon)) simulation.step();
      return simulation.units.find((unit) => unit.isSummon)!.stats.maxHealth;
    };
    expect(horseHealth(3)).toBeCloseTo(horseHealth(1) * 6);
  });
});

describe('Moço — Estagiário (ataque aleatório)', () => {
  const moco = (starLevel?: 1 | 2 | 3) => createCombatUnit(characterSpec('moco', 'A1', 'A', cellAt(2, 3), starLevel));

  it('sorteia erro (5%), dano medíocre (35%) e dano excelente (60%)', () => {
    const random = new SeededRandom(2024);
    const unit = moco();
    const rolls = Array.from({ length: 20_000 }, () => rollRandomAttack(random, unit)!);
    const share = (predicate: (roll: { rawDamage: number; missed: boolean }) => boolean) => rolls.filter(predicate).length / rolls.length;

    expect(share((roll) => roll.missed)).toBeGreaterThan(0.03);
    expect(share((roll) => roll.missed)).toBeLessThan(0.07);
    expect(share((roll) => !roll.missed && roll.rawDamage <= 40)).toBeGreaterThan(0.32);
    expect(share((roll) => !roll.missed && roll.rawDamage <= 40)).toBeLessThan(0.38);
    expect(share((roll) => roll.rawDamage >= 80)).toBeGreaterThan(0.57);
    expect(share((roll) => roll.rawDamage >= 80)).toBeLessThan(0.63);
  });

  it('o dano sempre cai nas faixas medíocre (20–40) ou excelente (80–100)', () => {
    const random = new SeededRandom(7);
    const unit = moco();
    for (let attempt = 0; attempt < 5000; attempt++) {
      const roll = rollRandomAttack(random, unit)!;
      if (roll.missed) continue;
      const isMediocre = roll.rawDamage >= 20 && roll.rawDamage <= 40;
      const isExcellent = roll.rawDamage >= 80 && roll.rawDamage <= 100;
      expect(isMediocre || isExcellent).toBe(true);
    }
  });

  it('o dano acompanha a estrela', () => {
    const random = new SeededRandom(7);
    const threeStars = moco(3);
    for (let attempt = 0; attempt < 500; attempt++) {
      const roll = rollRandomAttack(random, threeStars)!;
      if (!roll.missed) expect(roll.rawDamage).toBeGreaterThanOrEqual(20 * 6);
    }
  });

  it('quem não tem ataque aleatório ataca normalmente', () => {
    const bixo = createCombatUnit(characterSpec('bixo', 'A1', 'A', cellAt(2, 3)));
    expect(rollRandomAttack(new SeededRandom(1), bixo)).toBeNull();
  });

  it('no combate, alguns ataques erram e os acertos respeitam as faixas', () => {
    // Poucos ataques erram (5%), então junta vários combates para o teste não depender de uma semente de sorte.
    const attacks = Array.from({ length: 10 }, (_, index) => {
      const simulation = new CombatSimulation({
        seed: 11 + index,
        units: [characterSpec('moco', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 5), { health: 10 })],
        timeLimitMs: 14_000,
      });
      return ofType(stepUntil(simulation, 14_000), 'attack').filter((event) => event.attackerId === 'A1');
    }).flat();
    expect(attacks.length).toBeGreaterThan(8);
    expect(attacks.some((attack) => attack.missed)).toBe(true);
    for (const attack of attacks.filter((candidate) => !candidate.missed)) {
      const isMediocre = attack.damage >= 20 - 1e-9 && attack.damage <= 40 + 1e-9;
      const isExcellent = attack.damage >= 80 - 1e-9 && attack.damage <= 100 + 1e-9;
      expect(isMediocre || isExcellent).toBe(true);
    }
  });
});

describe('Derson — Invocar o protagonista (clone provocador)', () => {
  const dersonVersusDummies = () =>
    new CombatSimulation({
      seed: 'derson',
      units: [characterSpec('derson', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 5)), dummy('B2', 'B', cellAt(3, 5))],
    });

  it('cria o clone assim que há inimigo ao alcance, perto dele e do lado do inimigo', () => {
    const simulation = dersonVersusDummies();
    const events = stepUntil(simulation, 2500);
    const spawns = ofType(events, 'spawn');
    expect(spawns).toHaveLength(1);
    const clone = unitOf(simulation, spawns[0]!.unitId);
    expect(clone).toMatchObject({ name: 'Protagonista', side: 'A', isSummon: true, isDecoy: true, tauntRadius: 3 });
    expect(hexDistance(unitOf(simulation, 'A1').cell, clone.cell)).toBeLessThanOrEqual(2);
    const decoyEffect = DEFAULT_CHARACTERS.find((character) => character.id === 'derson')!.ability.effects[0];
    expect(decoyEffect?.type).toBe('summon_decoy');
    expect(clone.stats.maxHealth).toBe((decoyEffect as { health: number }).health * HEALTH_PER_POINT);
  });

  it('o clone não ataca nem anda, mas os inimigos próximos passam a atacá-lo', () => {
    const simulation = dersonVersusDummies();
    const events = stepUntil(simulation, 5000);
    const cloneId = ofType(events, 'spawn')[0]!.unitId;
    const cloneCell = unitOf(simulation, cloneId).cell;
    expect(ofType(events, 'attack').some((attack) => attack.attackerId === cloneId)).toBe(false);
    expect(ofType(events, 'move').some((move) => move.unitId === cloneId)).toBe(false);
    expect(unitOf(simulation, cloneId).cell).toEqual(cloneCell);
    expect(unitOf(simulation, 'B1').targetId).toBe(cloneId);
    expect(unitOf(simulation, 'B2').targetId).toBe(cloneId);
    expect(ofType(events, 'attack').some((attack) => attack.targetId === cloneId)).toBe(true);
  });

  it('o clone some depois do tempo de vida e os inimigos voltam a atacar Derson', () => {
    const simulation = dersonVersusDummies();
    stepUntil(simulation, 8000);
    const clone = simulation.units.find((unit) => unit.isDecoy)!;
    expect(clone.alive).toBe(false);
    expect(unitOf(simulation, 'B1').targetId).toBe('A1');
  });

  it('inimigos fora do raio de provocação ignoram o clone', () => {
    const simulation = new CombatSimulation({
      seed: 'derson-longe',
      units: [characterSpec('derson', 'A1', 'A', cellAt(2, 1)), dummy('B1', 'B', cellAt(2, 5)), dummy('B2', 'B', cellAt(2, 7))],
    });
    pinInPlace(simulation, 'A1', 'B1', 'B2');
    // B1 está a 4 casas de Derson, dentro do alcance da habilidade; B2 está bem mais longe.
    stepUntil(simulation, 2500);
    const clone = simulation.units.find((unit) => unit.isDecoy);
    expect(clone).toBeDefined();
    expect(hexDistance(clone!.cell, unitOf(simulation, 'B2').cell)).toBeGreaterThan(3);
    expect(unitOf(simulation, 'B2').targetId).not.toBe(clone!.id);
  });

  it('o clone não segura o combate nem conta como unidade viva do resultado', () => {
    const simulation = new CombatSimulation({
      seed: 'derson-fim',
      units: [characterSpec('derson', 'A1', 'A', cellAt(2, 3)), dummy('B1', 'B', cellAt(2, 4), { health: 1 })],
    });
    const result = simulation.run();
    expect(result.winner).toBe('A');
    expect(result.aliveCountBySide.A).toBe(1);
    expect(result.survivors.every((survivor) => !survivor.unitId.includes('~'))).toBe(true);
  });

  it('um Derson de 3 estrelas cria um clone mais resistente', () => {
    const healthOfClone = (starLevel: 1 | 2 | 3) => {
      const simulation = new CombatSimulation({ seed: 'derson-estrelas', units: [characterSpec('derson', 'A1', 'A', cellAt(2, 3), starLevel), dummy('B1', 'B', cellAt(2, 5))] });
      stepUntil(simulation, 2500);
      return simulation.units.find((unit) => unit.isDecoy)!.stats.maxHealth;
    };
    expect(healthOfClone(3)).toBeGreaterThan(healthOfClone(1));
  });
});

