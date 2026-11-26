/**
 * Desenho de cada formato de ataque. Tudo parte do que o evento de ataque informa (casas cobertas e orientação), então
 * o desenho acompanha o alcance de cada personagem. Um formato novo só precisa de uma entrada em `SHAPE_DRAWERS`
 * (o compilador acusa a falta dela).
 */
import Phaser from 'phaser';
import type { AttackShape } from '@shared/utils/attackArea';
import type { BoardProjection } from '@shared/utils/boardProjection';
import type { Hex, Point } from '@shared/utils/hex';
import { drawCellOutline } from '../board/boardLayout';
import { markTransient } from './transient';

export interface AttackShapeEffect {
  readonly shape: AttackShape;
  readonly origin: Hex;
  readonly areaCells: readonly Hex[];
  readonly facingRight: boolean;
  readonly color: number;
}

/** Medidas no chão visto de cima (sem a inclinação), com a origem nos pés de quem ataca. */
interface ShapeGeometry {
  readonly cells: readonly Point[];
  /** Distância até a borda da casa mais distante. */
  readonly reach: number;
  /** 0 = olhando para a direita; π = para a esquerda. */
  readonly facingAngle: number;
  readonly hexSize: number;
}

type ShapeDrawer = (graphics: Phaser.GameObjects.Graphics, geometry: ShapeGeometry, color: number) => void;

// Os dois ficam entre o chão e os personagens (a profundidade de um personagem é a altura dos pés, sempre positiva).
const CELL_TINT_DEPTH = -860;
const STROKE_DEPTH = -855;
const FADE_MS = 340;
const DIAGONAL_ANGLE = Math.PI / 6;

const SHAPE_DRAWERS: Readonly<Record<AttackShape, ShapeDrawer>> = {
  circle: drawRing,
  front_line: drawBeam,
  diagonals: drawDiagonals,
  semicircle: drawHalfMoon,
  scythe: drawScythe,
  dashed: drawDashes,
  dashed_center: drawDashes,
};

export function playAttackShape(scene: Phaser.Scene, projection: BoardProjection, effect: AttackShapeEffect): void {
  if (effect.areaCells.length === 0) {
    return;
  }
  const origin = projection.cellToGround(effect.origin);
  const tint = markTransient(scene.add.graphics().setDepth(CELL_TINT_DEPTH));
  effect.areaCells.forEach((cell) => drawCellOutline(tint, projection, cell, effect.color, 0.16, 1, 0.55));

  const stroke = markTransient(scene.add.graphics().setDepth(STROKE_DEPTH));
  stroke.setPosition(origin.x, origin.y).setScale(1, projection.tilt);
  SHAPE_DRAWERS[effect.shape](stroke, geometryOf(projection, origin, effect), effect.color);

  scene.tweens.add({
    targets: [tint, stroke],
    alpha: 0,
    delay: 110,
    duration: FADE_MS,
    onComplete: () => {
      tint.destroy();
      stroke.destroy();
    },
  });
}

function geometryOf(projection: BoardProjection, origin: Point, effect: AttackShapeEffect): ShapeGeometry {
  const cells = effect.areaCells.map((cell) => {
    const ground = projection.cellToGround(cell);
    return { x: ground.x - origin.x, y: (ground.y - origin.y) / projection.tilt };
  });
  const farthest = Math.max(...cells.map((cell) => Math.hypot(cell.x, cell.y)));
  return { cells, reach: farthest + projection.hexSize * 0.55, facingAngle: effect.facingRight ? 0 : Math.PI, hexSize: projection.hexSize };
}

function pointAt(angle: number, radius: number): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

/** Círculo: anel fechado em volta de quem ataca. */
function drawRing(graphics: Phaser.GameObjects.Graphics, geometry: ShapeGeometry, color: number): void {
  graphics.lineStyle(5, color, 0.9);
  graphics.strokeCircle(0, 0, geometry.reach);
  graphics.lineStyle(2, 0xffffff, 0.7);
  graphics.strokeCircle(0, 0, geometry.reach - 7);
}

/** Linha frontal: um feixe reto terminando em ponta. */
function drawBeam(graphics: Phaser.GameObjects.Graphics, geometry: ShapeGeometry, color: number): void {
  const direction = Math.cos(geometry.facingAngle);
  const halfHeight = geometry.hexSize * 0.3;
  const tip = direction * geometry.reach;
  const neck = tip - direction * halfHeight * 1.6;
  graphics.fillStyle(color, 0.45);
  graphics.fillPoints(
    [new Phaser.Math.Vector2(0, -halfHeight), new Phaser.Math.Vector2(neck, -halfHeight), new Phaser.Math.Vector2(tip, 0), new Phaser.Math.Vector2(neck, halfHeight), new Phaser.Math.Vector2(0, halfHeight)],
    true,
  );
  graphics.lineStyle(3, 0xffffff, 0.85);
  graphics.lineBetween(0, 0, tip, 0);
}

/** Diagonais: dois traços em "V" abertos para a frente, cada um até a última casa que ele cobre. */
function drawDiagonals(graphics: Phaser.GameObjects.Graphics, geometry: ShapeGeometry, color: number): void {
  [-DIAGONAL_ANGLE, DIAGONAL_ANGLE].forEach((offset) => {
    const length = armLength(geometry, offset);
    if (length === 0) {
      return;
    }
    const end = pointAt(geometry.facingAngle + offset, length);
    graphics.lineStyle(9, color, 0.75);
    graphics.lineBetween(0, 0, end.x, end.y);
    graphics.lineStyle(3, 0xffffff, 0.85);
    graphics.lineBetween(0, 0, end.x, end.y);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(end.x, end.y, 6);
  });
}

/** Distância até a casa mais longe na direção do braço (0 se o braço sai do tabuleiro logo de cara). */
function armLength(geometry: ShapeGeometry, offset: number): number {
  const armAngle = geometry.facingAngle + offset;
  const distances = geometry.cells
    .filter((cell) => Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(cell.y, cell.x) - armAngle)) < DIAGONAL_ANGLE / 2)
    .map((cell) => Math.hypot(cell.x, cell.y));
  return distances.length === 0 ? 0 : Math.max(...distances);
}

/** Semicírculo: meia-lua preenchida na frente e nos lados. */
function drawHalfMoon(graphics: Phaser.GameObjects.Graphics, geometry: ShapeGeometry, color: number): void {
  const start = geometry.facingAngle - Math.PI / 2;
  const end = geometry.facingAngle + Math.PI / 2;
  graphics.fillStyle(color, 0.28);
  graphics.slice(0, 0, geometry.reach, start, end, false);
  graphics.fillPath();
  graphics.lineStyle(6, color, 0.95);
  graphics.beginPath();
  graphics.arc(0, 0, geometry.reach, start, end, false);
  graphics.strokePath();
}

/** Foice: uma lâmina curva (grossa no meio, fina nas pontas) varrendo do lado até a frente, presa a um cabo. */
function drawScythe(graphics: Phaser.GameObjects.Graphics, geometry: ShapeGeometry, color: number): void {
  const relativeAngles = geometry.cells.map((cell) => Phaser.Math.Angle.Wrap(Math.atan2(cell.y, cell.x) - geometry.facingAngle));
  const from = geometry.facingAngle + Math.min(...relativeAngles) - 0.25;
  const to = geometry.facingAngle + Math.max(...relativeAngles) + 0.25;
  const steps = 18;
  const outer: Phaser.Math.Vector2[] = [];
  const inner: Phaser.Math.Vector2[] = [];
  for (let step = 0; step <= steps; step++) {
    const progress = step / steps;
    const angle = from + (to - from) * progress;
    outer.push(pointAt(angle, geometry.reach));
    inner.push(pointAt(angle, geometry.reach * (1 - 0.42 * Math.sin(Math.PI * progress))));
  }
  const blade = [...outer, ...inner.reverse()];
  graphics.fillStyle(color, 0.7);
  graphics.fillPoints(blade, true);
  graphics.lineStyle(2, 0xffffff, 0.9);
  graphics.strokePoints(blade, true);
  // O cabo fica na ponta do lado da frente, para o desenho espelhar quando a foice varre para o outro lado.
  const isFromTheFront = Math.abs(Math.min(...relativeAngles)) < Math.abs(Math.max(...relativeAngles));
  const handleEnd = pointAt(isFromTheFront ? from : to, geometry.reach);
  graphics.lineStyle(4, 0xe5e7eb, 0.8);
  graphics.lineBetween(0, 0, handleEnd.x, handleEnd.y);
}

/** Área tracejada: traços soltos só nas casas atingidas, deixando os vãos à mostra. */
function drawDashes(graphics: Phaser.GameObjects.Graphics, geometry: ShapeGeometry, color: number): void {
  const halfWidth = geometry.hexSize * 0.18;
  const halfHeight = geometry.hexSize * 0.45;
  geometry.cells.forEach((cell) => {
    graphics.fillStyle(color, 0.8);
    graphics.fillRoundedRect(cell.x - halfWidth, cell.y - halfHeight, halfWidth * 2, halfHeight * 2, halfWidth);
    graphics.lineStyle(2, 0xffffff, 0.9);
    graphics.strokeRoundedRect(cell.x - halfWidth, cell.y - halfHeight, halfWidth * 2, halfHeight * 2, halfWidth);
  });
}
