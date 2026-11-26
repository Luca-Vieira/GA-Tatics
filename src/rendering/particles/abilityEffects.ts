import Phaser from 'phaser';
import type { AbilityVisualInfo } from '@combat/engine/events';
import type { BoardProjection } from '@shared/utils/boardProjection';
import type { Point } from '@shared/utils/hex';
import { bySize } from '../layout/displayProfile';
import { FLOATING_TEXT_DEPTH, PROJECTILE_DEPTH } from '../sprites/UnitView';
import { addText } from '../ui/theme';
import { markTransient } from './transient';

const HEX_WIDTH_FACTOR = Math.sqrt(3);
/** Anéis e explosões ficam no chão, por baixo dos personagens. */
const EFFECT_DEPTH = -840;

function toColorNumber(color: string): number {
  return Phaser.Display.Color.HexStringToColor(color).color;
}

/** Diâmetro, na tela, de uma área de `radius` casas em torno de uma casa (antes da inclinação). */
function areaDiameter(projection: BoardProjection, radius: number): number {
  return (2 * radius + 0.9) * HEX_WIDTH_FACTOR * projection.hexSize;
}

/** Efeito visual de uma habilidade sobre o chão: explosão, chuva ou aura. Puro desenho, sem influência na simulação. */
export function playAbilityVisual(scene: Phaser.Scene, projection: BoardProjection, visual: AbilityVisualInfo, center: Point, radius: number): void {
  const color = toColorNumber(visual.color);
  switch (visual.kind) {
    case 'burst':
      expandingRing(scene, projection, center, areaDiameter(projection, radius), color, true);
      return;
    case 'aura':
      expandingRing(scene, projection, center, areaDiameter(projection, Math.max(radius, 0.6)), color, false);
      return;
    case 'rain':
      expandingRing(scene, projection, center, areaDiameter(projection, radius), color, false);
      fallingCubes(scene, center, areaDiameter(projection, radius), color);
      return;
    case 'projectile':
    case 'none':
      return;
  }
}

function expandingRing(scene: Phaser.Scene, projection: BoardProjection, center: Point, diameter: number, color: number, filled: boolean): void {
  const ring = markTransient(scene.add.ellipse(center.x, center.y, diameter, diameter * projection.tilt, color, filled ? 0.45 : 0.12).setDepth(EFFECT_DEPTH));
  ring.setStrokeStyle(3, color, 0.9);
  ring.setScale(0.3);
  scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
}

function fallingCubes(scene: Phaser.Scene, center: Point, diameter: number, color: number): void {
  const cubeCount = 9;
  for (let cube = 0; cube < cubeCount; cube++) {
    const landingX = center.x + (Math.random() - 0.5) * diameter * 0.8;
    const landingY = center.y + (Math.random() - 0.5) * diameter * 0.3;
    const square = markTransient(scene.add.rectangle(landingX, landingY - 260, 12, 12, color).setDepth(PROJECTILE_DEPTH).setAngle(Math.random() * 90));
    scene.tweens.add({
      targets: square,
      y: landingY,
      angle: square.angle + 180,
      delay: cube * 45,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => square.destroy(),
    });
  }
}

/** Nome da habilidade que sobe acima de quem a usou. */
export function showAbilityName(scene: Phaser.Scene, name: string, position: Point, color: string, icon?: string): void {
  const content = icon ? `${icon} ${name}` : name;
  const label = markTransient(
    addText(scene, position.x, position.y, content, { fontSize: bySize('16px', '25px'), color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 4, padding: { x: 2, y: 3 } })
      .setOrigin(0.5)
      .setDepth(FLOATING_TEXT_DEPTH + 1),
  );
  scene.tweens.add({ targets: label, y: position.y - 22, alpha: 0, duration: 1100, delay: 250, ease: 'Quad.easeOut', onComplete: () => label.destroy() });
}

/** Marcador de armadilha no chão. */
export function createTrapMarker(scene: Phaser.Scene, projection: BoardProjection, ground: Point, color: number): Phaser.GameObjects.Container {
  const base = scene.add.ellipse(0, 0, 34, 34 * projection.tilt, 0x1f2937, 0.9).setStrokeStyle(2, color, 1);
  const core = scene.add.circle(0, -2, 5, color);
  return scene.add.container(ground.x, ground.y, [base, core]).setDepth(ground.y - 1);
}
