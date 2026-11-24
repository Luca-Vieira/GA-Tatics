import Phaser from 'phaser';
import { COMBAT_STEP_MS } from '@combat/engine/constants';
import { CombatSimulation, type CombatConfig } from '@combat/engine/CombatSimulation';
import type { CombatEvent } from '@combat/engine/events';
import type { CombatResult } from '@combat/engine/result';
import type { CombatUnit } from '@combat/units/unit';
import type { BoardSide } from '@shared/constants/board';
import { flipBoardProjection, type BoardProjection } from '@shared/utils/boardProjection';
import type { Point } from '@shared/utils/hex';
import { SIDE_COLORS } from '../board/boardLayout';
import { createTrapMarker, playAbilityVisual, showAbilityName } from '../particles/abilityEffects';
import { destroyTransientEffects, markTransient } from '../particles/transient';
import type { SpriteAppearance } from '../sprites/spriteRegistry';
import { PROJECTILE_DEPTH, UnitView } from '../sprites/UnitView';

const MAXIMUM_FRAME_DELTA_MS = 100;
const MELEE_HIT_DELAY_MS = 90;
const PROJECTILE_FLIGHT_MS = 160;
const DEATH_DELAY_MS = 200;
const MELEE_BODY_SCALE = 1;
const RANGED_BODY_SCALE = 0.85;
const SUMMON_BODY_SCALE = 0.6;
/** Cada estrela aumenta um pouco o corpo, para dar para ver a evolução em campo. */
const STAR_BODY_SCALE_BONUS = 0.1;

const DAMAGE_COLORS = { ability: '#fb923c', poison: '#84cc16', drain: '#f87171' } as const;

type AttackEvent = Extract<CombatEvent, { type: 'attack' }>;

/**
 * Apresenta um combate: avança a simulação em passos fixos conforme o tempo passa e traduz cada evento em animação.
 * Só desenha; o resultado oficial vem da simulação (ou, numa partida multiplayer, do host).
 */
export class CombatPlayback {
  readonly simulation: CombatSimulation;

  private readonly unitViews = new Map<string, UnitView>();
  private readonly trapMarkers = new Map<string, Phaser.GameObjects.Container>();
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly projection: BoardProjection;
  private readonly isFlipped: boolean;
  private accumulatedMs = 0;

  private readonly spriteOf: (characterId: string | null) => SpriteAppearance | undefined;

  /**
   * `isViewedFromSideA`: o jogador luta como lado A; o tabuleiro gira 180° para ele continuar na metade de baixo.
   * `spriteOf`: sprite de cada personagem (sem ele, as unidades usam o desenho provisório).
   */
  constructor(
    private readonly scene: Phaser.Scene,
    projection: BoardProjection,
    config: CombatConfig,
    options: { readonly isViewedFromSideA?: boolean; readonly spriteOf?: (characterId: string | null) => SpriteAppearance | undefined } = {},
  ) {
    const isViewedFromSideA = options.isViewedFromSideA ?? false;
    this.spriteOf = options.spriteOf ?? (() => undefined);
    this.isFlipped = isViewedFromSideA;
    this.projection = isViewedFromSideA ? flipBoardProjection(projection) : projection;
    this.simulation = new CombatSimulation(config);
    this.simulation.getUnits().forEach((unit) => this.unitViews.set(unit.id, this.createUnitView(unit)));
  }

  get isFinished(): boolean {
    return this.simulation.isFinished;
  }

  get result(): CombatResult | null {
    return this.simulation.result;
  }

  /** Avança o relógio da apresentação. `speed` acelera a simulação sem mudar o resultado. */
  update(deltaMs: number, speed: number): void {
    this.accumulatedMs += Math.min(deltaMs, MAXIMUM_FRAME_DELTA_MS) * speed;
    while (this.accumulatedMs >= COMBAT_STEP_MS && !this.simulation.isFinished) {
      this.simulation.step();
      this.accumulatedMs -= COMBAT_STEP_MS;
      this.simulation.drainEvents().forEach((event) => this.playEvent(event));
    }
    this.unitViews.forEach((view) => view.update(this.simulation.timeMs));
  }

  /** Executa a simulação, sem esperar o relógio, até o instante pedido (usado em testes e para pular a animação). */
  advanceTo(timeMs: number): void {
    while (!this.simulation.isFinished && this.simulation.timeMs < timeMs) {
      this.update(COMBAT_STEP_MS, 1);
    }
  }

  destroy(): void {
    this.timers.forEach((timer) => timer.remove(false));
    this.timers.length = 0;
    this.unitViews.forEach((view) => view.destroy());
    this.unitViews.clear();
    this.trapMarkers.forEach((marker) => marker.destroy());
    this.trapMarkers.clear();
    destroyTransientEffects(this.scene);
  }

  private later(delayMs: number, callback: () => void): void {
    this.timers.push(this.scene.time.delayedCall(delayMs, callback));
  }

  private createUnitView(unit: Readonly<CombatUnit>): UnitView {
    const isRangedUnit = unit.stats.range > 1;
    const baseScale = unit.isSummon ? SUMMON_BODY_SCALE : isRangedUnit ? RANGED_BODY_SCALE : MELEE_BODY_SCALE;
    return new UnitView(this.scene, {
      groundPosition: this.projection.cellToGround(unit.cell),
      color: this.colorOfSide(unit.side),
      glyph: unit.name.charAt(0),
      displayName: unit.name,
      starLevel: unit.isSummon || unit.isStructure ? undefined : unit.starLevel,
      bodyScale: baseScale * (1 + STAR_BODY_SCALE_BONUS * (unit.starLevel - 1)),
      sprite: this.spriteOf(unit.characterId),
      perspectiveScaleAt: (groundY) => this.projection.perspectiveScaleAt(groundY),
    });
  }

  /** A cor segue a metade da tela em que a unidade aparece, não o lado da simulação. */
  private colorOfSide(side: BoardSide): number {
    const shownSide: BoardSide = this.isFlipped ? (side === 'A' ? 'B' : 'A') : side;
    return SIDE_COLORS[shownSide];
  }

  private unitOf(unitId: string): Readonly<CombatUnit> | undefined {
    return this.simulation.getUnits().find((unit) => unit.id === unitId);
  }

  private healthRatioOf(unitId: string, healthAfter: number): number {
    const unit = this.unitOf(unitId);
    return unit ? healthAfter / unit.stats.maxHealth : 0;
  }

  private playEvent(event: CombatEvent): void {
    switch (event.type) {
      case 'move':
        this.unitViews.get(event.unitId)?.moveTo(this.projection.cellToGround(event.to), event.durationMs, this.simulation.timeMs);
        return;
      case 'attack':
        this.playAttack(event);
        return;
      case 'death':
        this.later(DEATH_DELAY_MS, () => this.unitViews.get(event.unitId)?.playDeath());
        return;
      case 'ability':
        this.playAbility(event);
        return;
      case 'damage':
        this.playDamage(event);
        return;
      case 'heal':
        this.unitViews.get(event.targetId)?.playHeal(event.amount, this.healthRatioOf(event.targetId, event.healthAfter));
        return;
      case 'status':
        this.unitViews.get(event.unitId)?.setStatus(event.status, event.change === 'applied');
        return;
      case 'projectile': {
        const from = this.unitViews.get(event.fromId);
        const to = this.unitViews.get(event.toId);
        if (from && to) {
          this.shootProjectile(from.chestPosition, to.chestPosition);
        }
        return;
      }
      case 'spawn': {
        const unit = this.unitOf(event.unitId);
        if (unit) {
          this.unitViews.set(unit.id, this.createUnitView(unit));
        }
        return;
      }
      case 'trap':
        this.playTrap(event);
        return;
    }
  }

  private playAttack(event: AttackEvent): void {
    const attackerView = this.unitViews.get(event.attackerId);
    const targetView = this.unitViews.get(event.targetId);
    const target = this.unitOf(event.targetId);
    if (!attackerView || !targetView || !target) {
      return;
    }
    attackerView.playAttack(this.projection.cellToGround(target.cell));
    const healthRatio = event.targetHealthAfter / target.stats.maxHealth;

    if (event.missed) {
      this.later(MELEE_HIT_DELAY_MS, () => targetView.showFloatingText('Errou', '#cbd5e1'));
      return;
    }
    if (!event.isRanged) {
      this.later(MELEE_HIT_DELAY_MS, () => targetView.playHit(event.damage, healthRatio));
      return;
    }
    this.shootProjectile(attackerView.chestPosition, targetView.chestPosition);
    this.later(PROJECTILE_FLIGHT_MS, () => targetView.playHit(event.damage, healthRatio));
  }

  private playDamage(event: Extract<CombatEvent, { type: 'damage' }>): void {
    const targetView = this.unitViews.get(event.targetId);
    const healthRatio = this.healthRatioOf(event.targetId, event.healthAfter);
    const color = DAMAGE_COLORS[event.cause];
    if (event.cause === 'ability') {
      this.later(MELEE_HIT_DELAY_MS, () => targetView?.playHit(event.amount, healthRatio, color));
      return;
    }
    targetView?.playDamageOverTime(event.amount, healthRatio, color);
  }

  private playAbility(event: Extract<CombatEvent, { type: 'ability' }>): void {
    const casterView = this.unitViews.get(event.casterId);
    playAbilityVisual(this.scene, this.projection, event.visual, this.projection.cellToGround(event.center), event.radius);
    if (casterView) {
      showAbilityName(this.scene, event.abilityName, { x: casterView.groundPosition.x, y: casterView.chestPosition.y - 60 }, event.visual.color);
    }
  }

  private playTrap(event: Extract<CombatEvent, { type: 'trap' }>): void {
    if (event.change === 'placed') {
      this.trapMarkers.set(event.trapId, createTrapMarker(this.scene, this.projection, this.projection.cellToGround(event.cell), this.colorOfSide(event.side)));
      return;
    }
    const marker = this.trapMarkers.get(event.trapId);
    this.trapMarkers.delete(event.trapId);
    if (marker) {
      this.scene.tweens.add({ targets: marker, scale: 2, alpha: 0, duration: 300, onComplete: () => marker.destroy() });
    }
  }

  private shootProjectile(from: Point, to: Point): void {
    const projectile = markTransient(this.scene.add.circle(from.x, from.y, 6, 0xfde047).setDepth(PROJECTILE_DEPTH));
    this.scene.tweens.add({ targets: projectile, x: to.x, y: to.y, duration: PROJECTILE_FLIGHT_MS, ease: 'Linear', onComplete: () => projectile.destroy() });
  }
}
