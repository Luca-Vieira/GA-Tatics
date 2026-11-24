import Phaser from 'phaser';
import { isInsideBoard, mirrorCell, sideOfCell, cellsWithinRange, BOARD_CELLS } from '@shared/constants/board';
import type { BoardProjection } from '@shared/utils/boardProjection';
import type { Hex, Point } from '@shared/utils/hex';
import type { OwnedUnit, PlayerState, UnitLocation } from '@core/players/playerState';
import { SIDE_COLORS, drawCellOutline } from '../board/boardLayout';
import type { SpriteAppearance } from '../sprites/spriteRegistry';
import { UnitView } from '../sprites/UnitView';

export interface UnitAppearance {
  readonly name: string;
  readonly isRanged: boolean;
  /** Alcance de ataque em casas; 0 = não ataca (não mostra área de alcance). */
  readonly range: number;
  /** Cor da sinergia vigente, desenhada como anel no chão. */
  readonly accentColor: number;
  /** Sprite do personagem, se o servidor tiver um. */
  readonly sprite?: SpriteAppearance;
}

export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BenchSlotLayout {
  /** Centro da casa da reserva; os pés da unidade ficam um pouco abaixo dele. */
  readonly center: Point;
  readonly width: number;
  readonly height: number;
}

export interface PreparationCallbacks {
  onSelect(unitId: string | null): void;
  /** Um arrasto começou ou terminou (a interface mostra a dica de venda enquanto dura). */
  onDragChange(isDragging: boolean): void;
  onMove(unitId: string, destination: UnitLocation): void;
  onSell(unitId: string): void;
}

interface PreparationOptions {
  readonly projection: BoardProjection;
  readonly benchSlots: readonly BenchSlotLayout[];
  /** Soltar uma unidade aqui a vende. */
  readonly sellArea: Rectangle;
  readonly unitAppearance: (unit: OwnedUnit) => UnitAppearance;
  readonly callbacks: PreparationCallbacks;
}

interface ViewEntry {
  readonly view: UnitView;
  readonly starLevel: number;
  readonly accentColor: number;
}

interface DragState {
  readonly unitId: string;
  readonly startPointer: Point;
  readonly grabOffset: Point;
  moved: boolean;
}

const DRAG_THRESHOLD_PIXELS = 6;
const RANGE_COLOR = 0xf87171;
const BENCH_FEET_OFFSET = 22;
const MELEE_BODY_SCALE = 1;
const RANGED_BODY_SCALE = 0.85;
const STAR_BODY_SCALE_BONUS = 0.1;
const OWN_CELLS = BOARD_CELLS.filter((cell) => sideOfCell(cell) === 'B');

/**
 * Preparação: mostra as unidades do jogador (tabuleiro e reserva) e trata cliques e arrastos.
 * Nada aqui decide regra: cada gesto vira uma chamada em `callbacks`, e a tela é refeita a partir do estado do jogador.
 * Na tela, a metade do jogador é a de baixo (lado B), então as casas guardadas no referencial do lado A são espelhadas.
 */
export class PreparationView {
  private readonly entries = new Map<string, ViewEntry>();
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly rangeGraphics: Phaser.GameObjects.Graphics;
  private readonly benchGraphics: Phaser.GameObjects.Graphics;
  private units: readonly OwnedUnit[] = [];
  private drag: DragState | null = null;
  private selectedUnitId: string | null = null;
  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: PreparationOptions,
  ) {
    this.highlight = scene.add.graphics().setDepth(-900);
    this.rangeGraphics = scene.add.graphics().setDepth(-880);
    this.benchGraphics = scene.add.graphics().setDepth(-450);
    this.drawBenchSlots();

    scene.input.on('pointerdown', this.handlePointerDown, this);
    scene.input.on('pointermove', this.handlePointerMove, this);
    scene.input.on('pointerup', this.handlePointerUp, this);
  }

  get selectedId(): string | null {
    return this.selectedUnitId;
  }

  /** Reconstrói a tela a partir do estado do jogador: cria, atualiza e remove as unidades. */
  sync(player: PlayerState): void {
    this.units = player.units;
    const presentIds = new Set(player.units.map((unit) => unit.id));
    for (const [unitId, entry] of this.entries) {
      if (!presentIds.has(unitId)) {
        entry.view.destroy();
        this.entries.delete(unitId);
        if (this.selectedUnitId === unitId) {
          this.selectedUnitId = null;
        }
      }
    }
    for (const unit of player.units) {
      this.syncUnit(unit);
    }
    this.entries.forEach((entry, unitId) => entry.view.setSelected(unitId === this.selectedUnitId));
    this.refreshRangeOverlay();
  }

  update(simulationTimeMs: number): void {
    this.entries.forEach((entry) => entry.view.update(simulationTimeMs));
  }

  /** Liga ou desliga os gestos (só a preparação aceita mudanças). */
  setEnabled(isEnabled: boolean): void {
    this.enabled = isEnabled;
    if (!isEnabled) {
      this.cancelDrag();
    }
  }

  /** Esconde as unidades de preparação enquanto o combate as substitui. */
  setVisible(isVisible: boolean): void {
    this.entries.forEach((entry) => entry.view.setVisible(isVisible));
    this.highlight.setVisible(isVisible);
    this.rangeGraphics.setVisible(isVisible);
    this.benchGraphics.setVisible(isVisible);
  }

  select(unitId: string | null): void {
    this.selectedUnitId = unitId;
    this.entries.forEach((entry, id) => entry.view.setSelected(id === unitId));
    this.refreshRangeOverlay();
    this.options.callbacks.onSelect(unitId);
  }

  /** Posição na tela dos pés da unidade, útil para efeitos (fusão, venda). */
  groundPositionOf(unitId: string): Point | null {
    return this.entries.get(unitId)?.view.groundPosition ?? null;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);
    this.entries.forEach((entry) => entry.view.destroy());
    this.entries.clear();
    this.highlight.destroy();
    this.rangeGraphics.destroy();
    this.benchGraphics.destroy();
  }

  // --- Montagem das unidades ---------------------------------------------------------------------

  private syncUnit(unit: OwnedUnit): void {
    const appearance = this.options.unitAppearance(unit);
    const existing = this.entries.get(unit.id);
    const needsRebuild = existing && (existing.starLevel !== unit.starLevel || existing.accentColor !== appearance.accentColor);
    if (existing && needsRebuild) {
      existing.view.destroy();
      this.entries.delete(unit.id);
    }
    const entry = this.entries.get(unit.id) ?? this.createEntry(unit, appearance);
    const isBeingDragged = this.drag?.moved === true && this.drag.unitId === unit.id;
    if (!isBeingDragged) {
      entry.view.placeAt(this.groundPositionFor(unit.location));
    }
  }

  private createEntry(unit: OwnedUnit, appearance: UnitAppearance): ViewEntry {
    const baseScale = appearance.isRanged ? RANGED_BODY_SCALE : MELEE_BODY_SCALE;
    const view = new UnitView(this.scene, {
      groundPosition: this.groundPositionFor(unit.location),
      color: SIDE_COLORS.B,
      glyph: appearance.name.charAt(0),
      displayName: appearance.name,
      starLevel: unit.starLevel,
      accentColor: appearance.accentColor,
      sprite: appearance.sprite,
      showHealthBar: false,
      bodyScale: baseScale * (1 + STAR_BODY_SCALE_BONUS * (unit.starLevel - 1)),
      perspectiveScaleAt: (groundY) => this.options.projection.perspectiveScaleAt(groundY),
    });
    const entry: ViewEntry = { view, starLevel: unit.starLevel, accentColor: appearance.accentColor };
    this.entries.set(unit.id, entry);
    return entry;
  }

  /** Onde os pés da unidade ficam na tela, dado onde ela está no estado do jogador. */
  private groundPositionFor(location: UnitLocation): Point {
    if (location.kind === 'board') {
      return this.options.projection.cellToGround(mirrorCell(location.cell));
    }
    const slot = this.options.benchSlots[location.slot];
    return slot ? { x: slot.center.x, y: slot.center.y + BENCH_FEET_OFFSET } : { x: 0, y: 0 };
  }

  private drawBenchSlots(): void {
    this.benchGraphics.clear();
    for (const slot of this.options.benchSlots) {
      this.benchGraphics.fillStyle(0x0f1a30, 0.95);
      this.benchGraphics.fillRoundedRect(slot.center.x - slot.width / 2, slot.center.y - slot.height / 2, slot.width, slot.height, 8);
      this.benchGraphics.lineStyle(2, 0x3b4d73, 1);
      this.benchGraphics.strokeRoundedRect(slot.center.x - slot.width / 2, slot.center.y - slot.height / 2, slot.width, slot.height, 8);
    }
  }

  // --- Gestos -------------------------------------------------------------------------------------

  private handlePointerDown(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
    if (!this.enabled || currentlyOver.length > 0) {
      return;
    }
    const point = { x: pointer.x, y: pointer.y };
    const unit = this.unitAt(point);
    if (!unit) {
      this.handleClickOnEmptySpace(point);
      return;
    }
    const view = this.entries.get(unit.id)?.view;
    if (!view) {
      return;
    }
    this.drag = {
      unitId: unit.id,
      startPointer: point,
      grabOffset: { x: view.groundPosition.x - point.x, y: view.groundPosition.y - point.y },
      moved: false,
    };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || !this.enabled) {
      return;
    }
    const view = this.entries.get(drag.unitId)?.view;
    if (!view) {
      return;
    }
    const travelled = Math.hypot(pointer.x - drag.startPointer.x, pointer.y - drag.startPointer.y);
    if (!drag.moved && travelled < DRAG_THRESHOLD_PIXELS) {
      return;
    }
    if (!drag.moved) {
      this.options.callbacks.onDragChange(true);
    }
    drag.moved = true;
    view.setDragging(true);
    view.placeAt({ x: pointer.x + drag.grabOffset.x, y: pointer.y + drag.grabOffset.y });
    this.drawDropHighlight(view.groundPosition);
    this.refreshRangeOverlay();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    this.drag = null;
    this.highlight.clear();
    this.refreshRangeOverlay();
    if (!drag) {
      return;
    }
    if (drag.moved) {
      this.options.callbacks.onDragChange(false);
    }
    const view = this.entries.get(drag.unitId)?.view;
    view?.setDragging(false);
    if (!drag.moved) {
      this.select(this.selectedUnitId === drag.unitId ? null : drag.unitId);
      return;
    }
    if (view) {
      this.dropUnit(drag.unitId, { x: pointer.x, y: pointer.y }, view.groundPosition);
    }
  }

  private cancelDrag(): void {
    const drag = this.drag;
    this.drag = null;
    this.highlight.clear();
    this.refreshRangeOverlay();
    if (drag) {
      this.entries.get(drag.unitId)?.view.setDragging(false);
      if (drag.moved) {
        this.options.callbacks.onDragChange(false);
      }
    }
  }

  /** Solta a unidade: reserva, loja (vende), casa do tabuleiro; em qualquer outro lugar, ela volta. */
  private dropUnit(unitId: string, pointer: Point, feet: Point): void {
    const benchSlot = this.benchSlotAt(pointer);
    if (benchSlot !== null) {
      this.options.callbacks.onMove(unitId, { kind: 'bench', slot: benchSlot });
      return;
    }
    if (isInside(this.options.sellArea, pointer)) {
      this.options.callbacks.onSell(unitId);
      return;
    }
    const cell = this.ownCellAt(feet);
    if (cell) {
      this.options.callbacks.onMove(unitId, { kind: 'board', cell: mirrorCell(cell) });
      // Ao posicionar, a unidade fica selecionada e o alcance dela continua à mostra.
      this.select(unitId);
      return;
    }
    this.snapBack(unitId);
  }

  private snapBack(unitId: string): void {
    const unit = this.units.find((candidate) => candidate.id === unitId);
    if (unit) {
      this.entries.get(unitId)?.view.placeAt(this.groundPositionFor(unit.location));
    }
  }

  /** Com uma unidade selecionada, clicar numa casa ou espaço da reserva a leva para lá. */
  private handleClickOnEmptySpace(point: Point): void {
    const selectedId = this.selectedUnitId;
    if (!selectedId) {
      return;
    }
    const benchSlot = this.benchSlotAt(point);
    if (benchSlot !== null) {
      this.options.callbacks.onMove(selectedId, { kind: 'bench', slot: benchSlot });
      return;
    }
    const cell = this.ownCellAt(point);
    if (cell) {
      this.options.callbacks.onMove(selectedId, { kind: 'board', cell: mirrorCell(cell) });
      return;
    }
    this.select(null);
  }

  // --- Consultas de posição -----------------------------------------------------------------------

  /** Unidade sob o ponto; entre sobrepostas, a que está mais à frente (pés mais abaixo). */
  private unitAt(point: Point): OwnedUnit | null {
    const hits = this.units.filter((unit) => this.entries.get(unit.id)?.view.containsPoint(point));
    hits.sort((first, second) => (this.entries.get(second.id)?.view.groundPosition.y ?? 0) - (this.entries.get(first.id)?.view.groundPosition.y ?? 0));
    return hits[0] ?? null;
  }

  private benchSlotAt(point: Point): number | null {
    const index = this.options.benchSlots.findIndex((slot) => Math.abs(point.x - slot.center.x) <= slot.width / 2 && Math.abs(point.y - slot.center.y) <= slot.height / 2);
    return index >= 0 ? index : null;
  }

  /** Casa da metade do jogador (a de baixo) sob o ponto, ou `null`. */
  private ownCellAt(point: Point): Hex | null {
    const cell = this.options.projection.groundToCell(point);
    return isInsideBoard(cell) && sideOfCell(cell) === 'B' ? cell : null;
  }

  /**
   * Área de alcance de ataque: de quem está sendo arrastado (a partir da casa em que ele cairia) ou, sem arrasto,
   * da unidade selecionada que está no tabuleiro. Reserva e unidades que não atacam não mostram área.
   */
  private refreshRangeOverlay(): void {
    this.rangeGraphics.clear();
    const target = this.rangeTarget();
    if (!target || target.range < 1) {
      return;
    }
    for (const cell of cellsWithinRange(target.center, target.range)) {
      drawCellOutline(this.rangeGraphics, this.options.projection, cell, RANGE_COLOR, 0.3, 2);
    }
    drawCellOutline(this.rangeGraphics, this.options.projection, target.center, RANGE_COLOR, 0.35, 2);
  }

  /** Casa central (já na orientação da tela) e alcance da unidade cujo alcance deve aparecer. */
  private rangeTarget(): { readonly center: Hex; readonly range: number } | null {
    const dragged = this.drag?.moved ? this.units.find((unit) => unit.id === this.drag?.unitId) : undefined;
    if (dragged) {
      const feet = this.entries.get(dragged.id)?.view.groundPosition;
      const cell = feet ? this.ownCellAt(feet) : null;
      return cell ? { center: cell, range: this.options.unitAppearance(dragged).range } : null;
    }
    const selected = this.units.find((unit) => unit.id === this.selectedUnitId);
    if (!selected || selected.location.kind !== 'board') {
      return null;
    }
    return { center: mirrorCell(selected.location.cell), range: this.options.unitAppearance(selected).range };
  }

  private drawDropHighlight(feet: Point): void {
    this.highlight.clear();
    for (const cell of OWN_CELLS) {
      drawCellOutline(this.highlight, this.options.projection, cell, 0xffffff, 0.08, 1);
    }
    const target = this.ownCellAt(feet);
    if (target) {
      drawCellOutline(this.highlight, this.options.projection, target, 0xfde047, 0.25, 3);
    }
  }
}

function isInside(area: Rectangle, point: Point): boolean {
  return point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height;
}
