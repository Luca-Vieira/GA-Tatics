import Phaser from 'phaser';
import { COMBAT_STEP_MS } from '@combat/engine/constants';
import { CombatSimulation, type CombatConfig } from '@combat/engine/CombatSimulation';
import type { CombatEvent } from '@combat/engine/events';
import type { CombatResult } from '@combat/engine/result';
import { inspectCombatUnit, type CombatUnitInspection } from '@combat/units/inspect';
import type { CombatUnit } from '@combat/units/unit';
import type { BoardSide } from '@shared/constants/board';
import { flipBoardProjection, type BoardProjection } from '@shared/utils/boardProjection';
import type { Point } from '@shared/utils/hex';
import type { SoundEffect } from '../audio';
import { SIDE_COLORS, drawCellOutline } from '../board/boardLayout';
import { createTrapMarker, playAbilityVisual, showAbilityName } from '../particles/abilityEffects';
import { playAttackShape } from '../particles/attackShapeEffects';
import { PROJECTILE_FLIGHT_MS, shootProjectile, type ProjectileLook } from '../particles/projectile';
import { createTerrainPatch, removeTerrainPatch } from '../particles/terrainPatch';
import { destroyTransientEffects } from '../particles/transient';
import type { SpriteAppearance } from '../sprites/spriteRegistry';
import { UnitView } from '../sprites/UnitView';
import { isFacingScreenRight } from './combatOrientation';
import { damageSoundOf, immediateSoundOf } from './combatSounds';

const MAXIMUM_FRAME_DELTA_MS = 100;
const MELEE_HIT_DELAY_MS = 90;
const DEATH_DELAY_MS = 200;
const MELEE_BODY_SCALE = 1.05;
const RANGED_BODY_SCALE = 0.92;
const SUMMON_BODY_SCALE = 0.66;
/** Cada estrela aumenta um pouco o corpo, para dar para ver a evolução em campo. */
const STAR_BODY_SCALE_BONUS = 0.08;
const SELECTION_COLOR = 0xfde047;
const SELECTION_AREA_DEPTH = -870;

const DAMAGE_COLORS = { splash: '#fde68a', ability: '#fb923c', poison: '#84cc16', drain: '#f87171' } as const;

type AttackEvent = Extract<CombatEvent, { type: 'attack' }>;

export interface CombatPlaybackOptions {
  /** O jogador luta como lado A; o tabuleiro gira 180° para ele continuar na metade esquerda. */
  readonly isViewedFromSideA?: boolean;
  /** Sprite de cada unidade (sem ele, vale o boneco provisório). */
  readonly spriteOf?: (unit: Readonly<CombatUnit>) => SpriteAppearance | undefined;
  readonly playSound?: (effect: SoundEffect) => void;
}

/**
 * Apresenta um combate: avança a simulação em passos fixos conforme o tempo passa e traduz cada evento em animação.
 * Só desenha; o resultado oficial vem da simulação (ou, numa partida multiplayer, do host). Também permite consultar
 * uma unidade durante a luta (seleção e destaque da área de ataque), sem influenciar a simulação.
 */
export class CombatPlayback {
  readonly simulation: CombatSimulation;

  private readonly unitViews = new Map<string, UnitView>();
  private readonly unitsById = new Map<string, Readonly<CombatUnit>>();
  private readonly trapMarkers = new Map<string, Phaser.GameObjects.Container>();
  private readonly terrainPatches = new Map<string, Phaser.GameObjects.Container>();
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly projection: BoardProjection;
  /** O tabuleiro está girado: o lado A aparece à esquerda. */
  readonly isViewedFromSideA: boolean;
  private readonly spriteOf: (unit: Readonly<CombatUnit>) => SpriteAppearance | undefined;
  private readonly playSound: (effect: SoundEffect) => void;
  private readonly selectionArea: Phaser.GameObjects.Graphics;
  private drawnSelectionKey = '';
  private selectedUnitId: string | null = null;
  private accumulatedMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    projection: BoardProjection,
    config: CombatConfig,
    options: CombatPlaybackOptions = {},
  ) {
    this.isViewedFromSideA = options.isViewedFromSideA ?? false;
    this.spriteOf = options.spriteOf ?? (() => undefined);
    this.playSound = options.playSound ?? (() => undefined);
    this.projection = this.isViewedFromSideA ? flipBoardProjection(projection) : projection;
    this.simulation = new CombatSimulation(config);
    this.selectionArea = scene.add.graphics().setDepth(SELECTION_AREA_DEPTH);
    this.simulation.getUnits().forEach((unit) => this.addUnit(unit));
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
    this.updateViews();
    this.drawSelectionArea();
  }

  /** Executa a simulação, sem esperar o relógio, até o instante pedido (usado em testes e para pular a animação). */
  advanceTo(timeMs: number): void {
    while (!this.simulation.isFinished && this.simulation.timeMs < timeMs) {
      this.update(COMBAT_STEP_MS, 1);
    }
  }

  /** Vai direto a um instante, sem animar o que passou (quem começa a assistir no meio do combate). */
  skipTo(timeMs: number): void {
    while (!this.simulation.isFinished && this.simulation.timeMs < timeMs) {
      this.simulation.step();
      this.simulation.drainEvents().forEach((event) => this.applySilently(event));
    }
    this.redrawUnits();
  }

  destroy(): void {
    this.timers.forEach((timer) => timer.remove(false));
    this.timers.length = 0;
    this.unitViews.forEach((view) => view.destroy());
    this.unitViews.clear();
    this.trapMarkers.forEach((marker) => marker.destroy());
    this.trapMarkers.clear();
    this.terrainPatches.forEach((patch) => patch.destroy());
    this.terrainPatches.clear();
    this.selectionArea.destroy();
    destroyTransientEffects(this.scene);
  }

  // --- Consulta durante o combate -------------------------------------------------------------------

  get selectedId(): string | null {
    return this.selectedUnitId;
  }

  /** Unidade viva sob o ponto; entre sobrepostas, a que está mais à frente. */
  unitIdAt(point: Point): string | null {
    const hits = [...this.unitViews].filter(([unitId, view]) => this.unitsById.get(unitId)?.alive === true && !view.isDead && view.containsPoint(point));
    hits.sort(([, first], [, second]) => second.groundPosition.y - first.groundPosition.y);
    return hits[0]?.[0] ?? null;
  }

  select(unitId: string | null): void {
    if (this.selectedUnitId !== null) {
      this.unitViews.get(this.selectedUnitId)?.setSelected(false);
    }
    this.selectedUnitId = unitId;
    if (unitId !== null) {
      this.unitViews.get(unitId)?.setSelected(true);
    }
    this.drawSelectionArea();
  }

  /** Retrato ao vivo da unidade selecionada (vale também depois que ela cai). */
  inspectSelected(): { readonly unit: Readonly<CombatUnit>; readonly inspection: CombatUnitInspection } | null {
    const unit = this.selectedUnitId === null ? undefined : this.unitsById.get(this.selectedUnitId);
    return unit ? { unit, inspection: inspectCombatUnit(unit, this.simulation.timeMs) } : null;
  }

  /** Onde a unidade selecionada está na tela (para o painel de detalhes abrir do outro lado). */
  selectedGroundPosition(): Point | null {
    const unit = this.selectedUnitId === null ? undefined : this.unitsById.get(this.selectedUnitId);
    return unit ? this.projection.cellToGround(unit.cell) : null;
  }

  /** Redesenha o destaque da área só quando a casa, a orientação ou a unidade mudam. */
  private drawSelectionArea(): void {
    const selected = this.inspectSelected();
    const isVisible = selected !== null && selected.unit.alive;
    const key = isVisible ? `${selected.unit.id}|${selected.unit.cell.q},${selected.unit.cell.r}|${selected.unit.facing}` : '';
    if (key === this.drawnSelectionKey) {
      return;
    }
    this.drawnSelectionKey = key;
    this.selectionArea.clear();
    if (!isVisible) {
      return;
    }
    selected.inspection.attackAreaCells.forEach((cell) => drawCellOutline(this.selectionArea, this.projection, cell, SELECTION_COLOR, 0.2, 2, 0.9));
    drawCellOutline(this.selectionArea, this.projection, selected.unit.cell, 0xffffff, 0.2, 3);
  }

  // --- Unidades ---------------------------------------------------------------------------------------

  private addUnit(unit: Readonly<CombatUnit>): void {
    this.unitsById.set(unit.id, unit);
    this.unitViews.set(unit.id, this.createUnitView(unit));
  }

  /** A orientação acompanha o alvo e muda mesmo sem evento, por isso é lida a cada quadro. */
  private updateViews(): void {
    this.unitViews.forEach((view, unitId) => {
      const unit = this.unitsById.get(unitId);
      if (unit) {
        view.setFacingRight(isFacingScreenRight(unit.facing, this.isViewedFromSideA));
      }
      view.update(this.simulation.timeMs);
    });
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
      sprite: this.spriteOf(unit),
      isTower: unit.isStructure,
      facingRight: isFacingScreenRight(unit.facing, this.isViewedFromSideA),
      perspectiveScaleAt: (groundY) => this.projection.perspectiveScaleAt(groundY),
    });
  }

  /** A cor segue a metade da tela em que a unidade aparece, não o lado da simulação. */
  private colorOfSide(side: BoardSide): number {
    const shownSide: BoardSide = this.isViewedFromSideA ? (side === 'A' ? 'B' : 'A') : side;
    return SIDE_COLORS[shownSide];
  }

  private healthRatioOf(unitId: string, healthAfter: number): number {
    const unit = this.unitsById.get(unitId);
    return unit ? healthAfter / unit.stats.maxHealth : 0;
  }

  /** Refaz os desenhos a partir do estado atual da simulação. */
  private redrawUnits(): void {
    this.unitViews.forEach((view) => view.destroy());
    this.unitViews.clear();
    for (const unit of this.simulation.getUnits()) {
      this.unitsById.set(unit.id, unit);
      if (!unit.alive) {
        continue;
      }
      const view = this.createUnitView(unit);
      view.showState(unit.health / unit.stats.maxHealth, unit.statuses.map((status) => status.kind));
      this.unitViews.set(unit.id, view);
    }
    this.drawSelectionArea();
  }

  private applySilently(event: CombatEvent): void {
    if (event.type === 'terrain') {
      this.playTerrain(event);
      return;
    }
    if (event.type !== 'trap') {
      return;
    }
    if (event.change === 'placed') {
      this.playTrap(event);
      return;
    }
    this.trapMarkers.get(event.trapId)?.destroy();
    this.trapMarkers.delete(event.trapId);
  }

  // --- Eventos ------------------------------------------------------------------------------------------

  private later(delayMs: number, callback: () => void): void {
    this.timers.push(this.scene.time.delayedCall(delayMs, callback));
  }

  private playEvent(event: CombatEvent): void {
    const sound = immediateSoundOf(event);
    if (sound) {
      this.playSound(sound);
    }
    switch (event.type) {
      case 'move':
        this.unitViews.get(event.unitId)?.moveTo(this.projection.cellToGround(event.to), event.durationMs, this.simulation.timeMs);
        return;
      case 'attack':
        this.playAttack(event);
        return;
      case 'death':
        this.playDeath(event.unitId);
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
      case 'projectile':
        this.playProjectile(event.fromId, event.toId, { icon: event.icon });
        return;
      case 'spawn': {
        const unit = this.simulation.getUnits().find((candidate) => candidate.id === event.unitId);
        if (unit) {
          this.addUnit(unit);
        }
        return;
      }
      case 'trap':
        this.playTrap(event);
        return;
      case 'terrain':
        this.playTerrain(event);
        return;
    }
  }

  private playAttack(event: AttackEvent): void {
    const attacker = this.unitsById.get(event.attackerId);
    const target = this.unitsById.get(event.targetId);
    const attackerView = this.unitViews.get(event.attackerId);
    const targetView = this.unitViews.get(event.targetId);
    if (!attacker || !target || !attackerView || !targetView) {
      return;
    }
    const facingRight = isFacingScreenRight(event.facing, this.isViewedFromSideA);
    attackerView.setFacingRight(facingRight);
    attackerView.playAttack(this.projection.cellToGround(target.cell));
    playAttackShape(this.scene, this.projection, { shape: event.shape, origin: event.origin, areaCells: event.areaCells, facingRight, color: this.colorOfSide(attacker.side) });
    this.playSound(event.isRanged ? 'shot' : 'attack');

    const healthRatio = event.targetHealthAfter / target.stats.maxHealth;
    // O som do impacto toca junto com a animação dele (depois do avanço ou do voo do projétil).
    const hit = () => {
      if (event.missed) {
        this.playSound('miss');
        targetView.showFloatingText('Errou', '#cbd5e1');
        return;
      }
      this.playSound(event.isRanged ? 'ranged_hit' : 'hit');
      targetView.playHit(event.damage, healthRatio);
    };
    if (!event.isRanged) {
      this.later(MELEE_HIT_DELAY_MS, hit);
      return;
    }
    shootProjectile(this.scene, attackerView.chestPosition, targetView.chestPosition, { icon: event.projectileIcon });
    this.later(PROJECTILE_FLIGHT_MS, hit);
  }

  private playProjectile(fromId: string, toId: string, look: ProjectileLook): void {
    const from = this.unitViews.get(fromId);
    const to = this.unitViews.get(toId);
    if (from && to) {
      shootProjectile(this.scene, from.chestPosition, to.chestPosition, look);
    }
  }

  private playDeath(unitId: string): void {
    this.playSound(this.unitsById.get(unitId)?.isStructure ? 'tower_destroyed' : 'unit_death');
    this.later(DEATH_DELAY_MS, () => this.unitViews.get(unitId)?.playDeath());
  }

  private playDamage(event: Extract<CombatEvent, { type: 'damage' }>): void {
    const targetView = this.unitViews.get(event.targetId);
    const healthRatio = this.healthRatioOf(event.targetId, event.healthAfter);
    const color = DAMAGE_COLORS[event.cause];
    if (event.cause === 'ability' || event.cause === 'splash') {
      this.later(MELEE_HIT_DELAY_MS, () => {
        this.playSound(damageSoundOf(event.cause));
        targetView?.playHit(event.amount, healthRatio, color);
      });
      return;
    }
    this.playSound(damageSoundOf(event.cause));
    targetView?.playDamageOverTime(event.amount, healthRatio, color);
  }

  private playAbility(event: Extract<CombatEvent, { type: 'ability' }>): void {
    playAbilityVisual(this.scene, this.projection, event.visual, this.projection.cellToGround(event.center), event.radius);
    const casterView = this.unitViews.get(event.casterId);
    if (!casterView) {
      return;
    }
    casterView.setFacingRight(isFacingScreenRight(event.facing, this.isViewedFromSideA));
    showAbilityName(this.scene, event.abilityName, { x: casterView.groundPosition.x, y: casterView.chestPosition.y - 60 }, event.visual.color, event.visual.icon);
  }

  private playTerrain(event: Extract<CombatEvent, { type: 'terrain' }>): void {
    if (event.change === 'placed') {
      const patch = createTerrainPatch(this.scene, this.projection, { ...event, sideColor: this.colorOfSide(event.side) });
      this.terrainPatches.set(event.terrainId, patch);
      return;
    }
    const patch = this.terrainPatches.get(event.terrainId);
    this.terrainPatches.delete(event.terrainId);
    if (patch) {
      removeTerrainPatch(this.scene, patch);
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
}
