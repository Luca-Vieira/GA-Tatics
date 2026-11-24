import { BOARD_CELLS, isInsideBoard, type BoardSide } from '@shared/constants/board';
import { hexDistance, hexKey, type Hex } from '@shared/utils/hex';
import { SeededRandom } from '@shared/utils/random';
import { castOnFirstHit, tryCastReadyAbility } from '../abilities/abilityCaster';
import { rollRandomAttack } from '../abilities/registeredBehaviors';
import { applyStatusToUnit, findStatus, removeStatus, type StatusInstance, type StatusSpec } from '../effects/status';
import { computeModifiers, type UnitModifiers } from '../effects/modifiers';
import { findRetreatCell, isTooCloseToEnemies } from '../movement/retreat';
import { findShortestPath } from '../pathfinding/bfs';
import { selectTarget } from '../targeting/targeting';
import { createCombatUnit, createSummonUnit } from '../units/createCombatUnit';
import { calculateDamageTaken } from '../units/damage';
import { countsForResult, type CombatUnit, type UnitSpec } from '../units/unit';
import { COMBAT_STEP_MS, DEFAULT_COMBAT_TIME_LIMIT_MS } from './constants';
import type { CombatEvent } from './events';
import { buildCombatResult, type CombatResult } from './result';
import type { CombatWorld, DamageOptions, DecoyRequest, TrapRequest } from './world';

export interface CombatConfig {
  /** Semente do combate: toda aleatoriedade das regras (ataques do Moço, confusão) vem dela. */
  readonly seed: number | string;
  readonly units: readonly UnitSpec[];
  readonly timeLimitMs?: number;
}

interface ActiveTrap extends TrapRequest {
  readonly id: string;
  readonly armedAtMs: number;
  readonly expiresAtMs: number;
}

const MELEE_RANGE = 1;
/** Folga, além do alcance de quem drena, até onde o alvo pode se afastar sem interromper a drenagem. */
const DRAIN_BREAK_MARGIN = 2;

/**
 * Simulação de combate em passos fixos. Não depende de Phaser nem de relógio real:
 * o mesmo estado inicial e a mesma semente produzem sempre o mesmo resultado.
 */
export class CombatSimulation implements CombatWorld {
  readonly random: SeededRandom;

  private readonly unitList: CombatUnit[];
  private readonly unitsById = new Map<string, CombatUnit>();
  private readonly cellOccupants = new Map<string, string>();
  private readonly traps: ActiveTrap[] = [];
  private readonly timeLimitMs: number;
  private pendingEvents: CombatEvent[] = [];
  private elapsedMs = 0;
  private stepCount = 0;
  private spawnCount = 0;
  private trapCount = 0;
  private finalResult: CombatResult | null = null;

  constructor(config: CombatConfig) {
    validateUnitSpecs(config.units);
    this.random = new SeededRandom(config.seed);
    this.timeLimitMs = config.timeLimitMs ?? DEFAULT_COMBAT_TIME_LIMIT_MS;
    this.unitList = [...config.units].sort(compareById).map(createCombatUnit);
    this.unitList.forEach((unit) => this.registerUnit(unit));
    this.finishIfCombatIsOver();
  }

  // --- Consulta -----------------------------------------------------------------------------------

  get nowMs(): number {
    return this.elapsedMs;
  }

  get timeMs(): number {
    return this.elapsedMs;
  }

  get isFinished(): boolean {
    return this.finalResult !== null;
  }

  get result(): CombatResult | null {
    return this.finalResult;
  }

  get units(): readonly CombatUnit[] {
    return this.unitList;
  }

  getUnits(): ReadonlyArray<Readonly<CombatUnit>> {
    return this.unitList;
  }

  /** Entrega e esvazia os eventos acumulados desde a última chamada. */
  drainEvents(): CombatEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  // --- Execução -----------------------------------------------------------------------------------

  /** Avança a simulação em um passo fixo. Não faz nada depois do fim do combate. */
  step(): void {
    if (this.finalResult) {
      return;
    }
    this.processStatuses();
    this.processRegeneration();
    this.expireSummons();
    this.processTraps();
    for (const unit of this.unitsInActionOrder()) {
      this.updateUnit(unit);
    }
    this.elapsedMs += COMBAT_STEP_MS;
    this.stepCount++;
    this.finishIfCombatIsOver();
  }

  /** Executa o combate até o fim e devolve o resultado. */
  run(): CombatResult {
    while (!this.finalResult) {
      this.step();
    }
    return this.finalResult;
  }

  /** A ordem de ação alterna a cada passo para nenhum lado agir sempre primeiro. */
  private unitsInActionOrder(): CombatUnit[] {
    const isEvenStep = this.stepCount % 2 === 0;
    return isEvenStep ? [...this.unitList] : [...this.unitList].reverse();
  }

  // --- Mundo (usado por habilidades e efeitos) -----------------------------------------------------

  emit(event: CombatEvent): void {
    this.pendingEvents.push(event);
  }

  isCellFree(cell: Hex): boolean {
    return isInsideBoard(cell) && !this.cellOccupants.has(hexKey(cell));
  }

  dealDamage(source: CombatUnit | null, target: CombatUnit, rawDamage: number, options: DamageOptions): number {
    if (!target.alive) {
      return 0;
    }
    const damageTaken = options.ignoreMitigation ? rawDamage : calculateDamageTaken(rawDamage, target.resistance, computeModifiers(target).damageReduction);
    const damageDealt = Math.min(damageTaken, target.health);
    target.health -= damageDealt;
    this.emitDamageEvent(source, target, damageDealt, options);

    if (target.health <= 0) {
      this.killUnit(target);
    }
    return damageDealt;
  }

  heal(source: CombatUnit | null, target: CombatUnit, amount: number): number {
    if (!target.alive) {
      return 0;
    }
    const healed = Math.min(amount, target.stats.maxHealth - target.health);
    if (healed <= 0) {
      return 0;
    }
    target.health += healed;
    this.emit({ type: 'heal', timeMs: this.elapsedMs, sourceId: source?.id ?? null, targetId: target.id, amount: healed, healthAfter: target.health });
    return healed;
  }

  applyStatus(source: CombatUnit, target: CombatUnit, spec: StatusSpec): void {
    if (!target.alive) {
      return;
    }
    applyStatusToUnit(target, source.id, spec, this.elapsedMs);
    this.emit({ type: 'status', timeMs: this.elapsedMs, unitId: target.id, status: spec.kind, change: 'applied' });
  }

  placeTrap(request: TrapRequest): void {
    const trap: ActiveTrap = {
      ...request,
      id: `trap${++this.trapCount}`,
      armedAtMs: this.elapsedMs + request.armingMs,
      expiresAtMs: this.elapsedMs + request.lifetimeMs,
    };
    this.traps.push(trap);
    this.emit({ type: 'trap', timeMs: this.elapsedMs, trapId: trap.id, change: 'placed', cell: trap.cell, side: trap.side });
  }

  spawnDecoy(request: DecoyRequest): void {
    const decoy = createSummonUnit({
      id: `${request.ownerId}~${request.name}${++this.spawnCount}`,
      name: request.name,
      side: request.side,
      cell: request.cell,
      stats: request.stats,
      starMultiplier: request.starMultiplier,
      ownerId: request.ownerId,
      expiresAtMs: this.elapsedMs + request.lifetimeMs,
      decoyTauntRadius: request.tauntRadius,
    });
    this.unitList.push(decoy);
    this.registerUnit(decoy);
    this.emit({ type: 'spawn', timeMs: this.elapsedMs, unitId: decoy.id, name: decoy.name, side: decoy.side, cell: decoy.cell, ownerId: request.ownerId });
  }

  private emitDamageEvent(source: CombatUnit | null, target: CombatUnit, damage: number, options: DamageOptions): void {
    if (options.cause === 'attack') {
      this.emit({
        type: 'attack',
        timeMs: this.elapsedMs,
        attackerId: source?.id ?? '',
        targetId: target.id,
        damage,
        targetHealthAfter: target.health,
        isRanged: (source?.stats.range ?? MELEE_RANGE) > MELEE_RANGE,
        missed: false,
      });
      return;
    }
    this.emit({
      type: 'damage',
      timeMs: this.elapsedMs,
      sourceId: source?.id ?? null,
      targetId: target.id,
      amount: damage,
      healthAfter: target.health,
      cause: options.cause,
    });
  }

  // --- Estados temporários, invocações e armadilhas -----------------------------------------------

  private processStatuses(): void {
    for (const unit of this.unitList) {
      if (!unit.alive) {
        continue;
      }
      this.expireStatuses(unit);
      for (const status of [...unit.statuses]) {
        if (!unit.alive) {
          break;
        }
        this.tickStatus(unit, status);
      }
    }
  }

  private expireStatuses(unit: CombatUnit): void {
    for (const status of [...unit.statuses]) {
      if (this.elapsedMs >= status.endsAtMs) {
        removeStatus(unit, status);
        this.emit({ type: 'status', timeMs: this.elapsedMs, unitId: unit.id, status: status.kind, change: 'expired' });
      }
    }
  }

  private tickStatus(unit: CombatUnit, status: StatusInstance): void {
    const isTickDue = status.tickMs !== null && this.elapsedMs >= status.nextTickAtMs;
    if (!isTickDue || status.tickMs === null) {
      return;
    }
    status.nextTickAtMs += status.tickMs;
    const source = this.unitsById.get(status.sourceId) ?? null;

    if (status.kind === 'poison') {
      this.dealDamage(source, unit, status.value, { cause: 'poison', ignoreMitigation: true });
      return;
    }
    if (status.kind === 'drain') {
      this.tickDrain(unit, status, source);
    }
  }

  /** A drenagem para se quem drena morreu ou se o alvo se afastou demais. */
  private tickDrain(target: CombatUnit, status: StatusInstance, source: CombatUnit | null): void {
    const isSourceAbleToDrain = source !== null && source.alive && hexDistance(source.cell, target.cell) <= source.stats.range + DRAIN_BREAK_MARGIN;
    if (!isSourceAbleToDrain) {
      removeStatus(target, status);
      this.emit({ type: 'status', timeMs: this.elapsedMs, unitId: target.id, status: 'drain', change: 'expired' });
      return;
    }
    const drained = this.dealDamage(source, target, status.value, { cause: 'drain', ignoreMitigation: true });
    this.heal(source, source, drained * status.healRatio);
  }

  /** Regeneração periódica de sinergia (Operacional): depende só do tempo simulado. */
  private processRegeneration(): void {
    for (const unit of this.unitList) {
      const hasRegeneration = unit.alive && unit.regenIntervalMs > 0;
      if (!hasRegeneration || this.elapsedMs < unit.nextRegenAtMs) {
        continue;
      }
      unit.nextRegenAtMs += unit.regenIntervalMs;
      this.heal(null, unit, unit.stats.maxHealth * unit.regenFraction);
    }
  }

  private expireSummons(): void {
    for (const unit of this.unitList) {
      const hasExpired = unit.alive && unit.expiresAtMs !== null && this.elapsedMs >= unit.expiresAtMs;
      if (hasExpired) {
        this.killUnit(unit);
      }
    }
  }

  private processTraps(): void {
    for (const trap of [...this.traps]) {
      if (this.elapsedMs >= trap.expiresAtMs) {
        this.removeTrap(trap, 'expired');
      } else if (this.elapsedMs >= trap.armedAtMs && this.isEnemyNearTrap(trap)) {
        this.removeTrap(trap, 'triggered');
        this.spawnSummons(trap);
      }
    }
  }

  private isEnemyNearTrap(trap: ActiveTrap): boolean {
    return this.unitList.some((unit) => unit.alive && unit.side !== trap.side && hexDistance(trap.cell, unit.cell) <= trap.triggerRadius);
  }

  private removeTrap(trap: ActiveTrap, change: 'triggered' | 'expired'): void {
    this.traps.splice(this.traps.indexOf(trap), 1);
    this.emit({ type: 'trap', timeMs: this.elapsedMs, trapId: trap.id, change, cell: trap.cell, side: trap.side });
  }

  private spawnSummons(trap: ActiveTrap): void {
    for (let created = 0; created < trap.summon.count; created++) {
      const cell = this.findFreeCellNear(trap.cell);
      if (!cell) {
        return;
      }
      const summon = createSummonUnit({
        id: `${trap.ownerId}~${trap.summon.name}${++this.spawnCount}`,
        name: trap.summon.name,
        side: trap.side,
        cell,
        stats: trap.summon.stats,
        starMultiplier: trap.starMultiplier,
        ownerId: trap.ownerId,
        expiresAtMs: this.elapsedMs + trap.summon.lifetimeMs,
      });
      this.unitList.push(summon);
      this.registerUnit(summon);
      this.emit({ type: 'spawn', timeMs: this.elapsedMs, unitId: summon.id, name: summon.name, side: summon.side, cell, ownerId: trap.ownerId });
    }
  }

  private findFreeCellNear(origin: Hex): Hex | null {
    const freeCells = BOARD_CELLS.filter((cell) => this.isCellFree(cell));
    freeCells.sort((first, second) => hexDistance(origin, first) - hexDistance(origin, second) || first.r - second.r || first.q - second.q);
    return freeCells[0] ?? null;
  }

  private registerUnit(unit: CombatUnit): void {
    this.unitsById.set(unit.id, unit);
    this.cellOccupants.set(hexKey(unit.cell), unit.id);
  }

  // --- Ação de cada unidade -----------------------------------------------------------------------

  private updateUnit(unit: CombatUnit): void {
    if (!unit.alive || unit.isStructure || unit.isDecoy) {
      return;
    }
    const modifiers = computeModifiers(unit);
    if (!modifiers.canAct) {
      return;
    }
    const target = this.resolveTarget(unit);
    if (tryCastReadyAbility(this, unit, target)) {
      return;
    }
    if (!target) {
      return;
    }

    const isTargetInRange = hexDistance(unit.cell, target.cell) <= unit.stats.range;
    if (isTargetInRange && this.attackIfReady(unit, target, modifiers)) {
      return;
    }
    if (this.retreatIfNeeded(unit, modifiers)) {
      return;
    }
    if (!isTargetInRange) {
      this.advanceTowardIfReady(unit, target, modifiers);
    }
  }

  /** Mantém o alvo enquanto ele estiver vivo; caso contrário escolhe outro segundo o perfil do personagem. */
  private resolveTarget(unit: CombatUnit): CombatUnit | null {
    // Um clone provocador por perto manda no alvo, mesmo que o atual ainda esteja vivo.
    const taunter = this.findTauntingDecoy(unit);
    if (taunter) {
      unit.targetId = taunter.id;
      return taunter;
    }
    const currentTarget = unit.targetId === null ? undefined : this.unitsById.get(unit.targetId);
    if (currentTarget?.alive) {
      return currentTarget;
    }
    const newTarget = selectTarget(unit, this.unitList);
    unit.targetId = newTarget?.id ?? null;
    return newTarget;
  }

  /** Clone inimigo vivo mais próximo cujo raio de provocação alcança a unidade; empate pelo menor id. */
  private findTauntingDecoy(unit: CombatUnit): CombatUnit | null {
    let best: CombatUnit | null = null;
    let bestDistance = Infinity;
    for (const candidate of this.unitList) {
      if (!candidate.alive || !candidate.isDecoy || candidate.side === unit.side) {
        continue;
      }
      const distance = hexDistance(unit.cell, candidate.cell);
      const isCloser = distance < bestDistance || (distance === bestDistance && best !== null && candidate.id < best.id);
      if (distance <= candidate.tauntRadius && isCloser) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  private attackIfReady(attacker: CombatUnit, target: CombatUnit, modifiers: UnitModifiers): boolean {
    if (this.elapsedMs < attacker.nextAttackAtMs) {
      return false;
    }
    const attacksPerSecond = attacker.stats.attacksPerSecond * modifiers.attackSpeedMultiplier;
    attacker.nextAttackAtMs = this.elapsedMs + 1000 / attacksPerSecond;

    const roll = this.rollAttack(attacker, modifiers);
    if (roll.missed) {
      this.emitMissedAttack(attacker, target);
      return true;
    }
    this.dealDamage(attacker, target, roll.rawDamage, { cause: 'attack' });
    if (target.alive) {
      castOnFirstHit(this, attacker, target);
    }
    return true;
  }

  /** Dano do ataque (normal ou aleatório) e se ele erra por confusão. */
  private rollAttack(attacker: CombatUnit, modifiers: UnitModifiers): { rawDamage: number; missed: boolean } {
    const randomRoll = rollRandomAttack(this.random, attacker);
    const baseDamage = randomRoll ? randomRoll.rawDamage : attacker.stats.damage;
    const rawDamage = baseDamage * modifiers.damageMultiplier;
    const missedByConfusion = this.consumeConfusion(attacker);
    return { rawDamage, missed: (randomRoll?.missed ?? false) || missedByConfusion };
  }

  /** Cada ataque sob confusão gasta uma carga e pode errar. */
  private consumeConfusion(attacker: CombatUnit): boolean {
    const confusion = findStatus(attacker, 'confuse');
    if (!confusion) {
      return false;
    }
    const missed = this.random.chance(confusion.value);
    confusion.chargesLeft = (confusion.chargesLeft ?? 1) - 1;
    if (confusion.chargesLeft <= 0) {
      removeStatus(attacker, confusion);
      this.emit({ type: 'status', timeMs: this.elapsedMs, unitId: attacker.id, status: 'confuse', change: 'expired' });
    }
    return missed;
  }

  private emitMissedAttack(attacker: CombatUnit, target: CombatUnit): void {
    this.emit({
      type: 'attack',
      timeMs: this.elapsedMs,
      attackerId: attacker.id,
      targetId: target.id,
      damage: 0,
      targetHealthAfter: target.health,
      isRanged: attacker.stats.range > MELEE_RANGE,
      missed: true,
    });
  }

  private killUnit(unit: CombatUnit): void {
    unit.alive = false;
    this.cellOccupants.delete(hexKey(unit.cell));
    this.emit({ type: 'death', timeMs: this.elapsedMs, unitId: unit.id });
  }

  private aliveEnemiesOf(unit: CombatUnit): CombatUnit[] {
    return this.unitList.filter((candidate) => candidate.alive && candidate.side !== unit.side);
  }

  /** Personagens "kite" recuam quando um inimigo chega perto demais. Devolve verdadeiro se recuou. */
  private retreatIfNeeded(unit: CombatUnit, modifiers: UnitModifiers): boolean {
    if (this.elapsedMs < unit.nextMoveAtMs) {
      return false;
    }
    const enemies = this.aliveEnemiesOf(unit);
    if (!isTooCloseToEnemies(unit, enemies)) {
      return false;
    }
    const retreatCell = findRetreatCell(unit, enemies, (cell) => this.isCellFree(cell));
    if (!retreatCell) {
      return false;
    }
    this.moveUnit(unit, retreatCell, modifiers);
    return true;
  }

  private advanceTowardIfReady(unit: CombatUnit, target: CombatUnit, modifiers: UnitModifiers): void {
    if (this.elapsedMs < unit.nextMoveAtMs) {
      return;
    }
    const path = findShortestPath(unit.cell, {
      isWalkable: (cell) => this.isCellFree(cell),
      isGoal: (cell) => this.isCellFree(cell) && hexDistance(cell, target.cell) <= unit.stats.range,
    });
    const nextCell = path?.[0];
    if (nextCell) {
      this.moveUnit(unit, nextCell, modifiers);
    }
  }

  private moveUnit(unit: CombatUnit, destination: Hex, modifiers: UnitModifiers): void {
    const moveDurationMs = 1000 / (unit.stats.hexesPerSecond * modifiers.moveSpeedMultiplier);
    this.cellOccupants.delete(hexKey(unit.cell));
    this.cellOccupants.set(hexKey(destination), unit.id);
    this.emit({ type: 'move', timeMs: this.elapsedMs, unitId: unit.id, from: unit.cell, to: destination, durationMs: moveDurationMs });
    unit.cell = destination;
    unit.nextMoveAtMs = this.elapsedMs + moveDurationMs;
  }

  // --- Fim do combate -----------------------------------------------------------------------------

  private finishIfCombatIsOver(): void {
    const hasAliveUnitsOnBothSides = this.hasAliveUnits('A') && this.hasAliveUnits('B');
    if (!hasAliveUnitsOnBothSides) {
      this.finalResult = buildCombatResult(this.unitList, 'elimination', this.elapsedMs);
      return;
    }
    if (this.elapsedMs >= this.timeLimitMs) {
      this.finalResult = buildCombatResult(this.unitList, 'timeout', this.elapsedMs);
    }
  }

  /** Invocações não seguram o combate: só conta quem foi colocado no tabuleiro. */
  private hasAliveUnits(side: BoardSide): boolean {
    return this.unitList.some((unit) => unit.side === side && unit.alive && countsForResult(unit));
  }
}

function compareById(first: UnitSpec, second: UnitSpec): number {
  if (first.id === second.id) {
    return 0;
  }
  return first.id < second.id ? -1 : 1;
}

function validateUnitSpecs(specs: readonly UnitSpec[]): void {
  const seenIds = new Set<string>();
  const seenCells = new Set<string>();
  const boardCellKeys = new Set(BOARD_CELLS.map(hexKey));
  for (const spec of specs) {
    const cellKey = hexKey(spec.cell);
    if (seenIds.has(spec.id)) {
      throw new Error(`Id de unidade repetido: ${spec.id}`);
    }
    if (!boardCellKeys.has(cellKey)) {
      throw new Error(`A unidade ${spec.id} está fora do tabuleiro (${cellKey}).`);
    }
    if (seenCells.has(cellKey)) {
      throw new Error(`Duas unidades na mesma casa (${cellKey}).`);
    }
    seenIds.add(spec.id);
    seenCells.add(cellKey);
  }
}
