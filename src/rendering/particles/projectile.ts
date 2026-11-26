/** Único lugar que desenha projéteis: com o ícone configurado no personagem (ex.: "L") ou, sem ícone, uma bolinha. */
import Phaser from 'phaser';
import type { Point } from '@shared/utils/hex';
import { PROJECTILE_DEPTH } from '../sprites/UnitView';
import { addText } from '../ui/theme';
import { markTransient } from './transient';

export const PROJECTILE_FLIGHT_MS = 200;
const DEFAULT_PROJECTILE_COLOR = '#fde047';

export interface ProjectileLook {
  readonly icon?: string;
  readonly color?: string;
}

export function shootProjectile(scene: Phaser.Scene, from: Point, to: Point, look: ProjectileLook = {}): void {
  const projectile = markTransient(createProjectile(scene, from, look));
  projectile.setDepth(PROJECTILE_DEPTH);
  scene.tweens.add({ targets: projectile, x: to.x, y: to.y, duration: PROJECTILE_FLIGHT_MS, ease: 'Linear', onComplete: () => projectile.destroy() });
}

function createProjectile(scene: Phaser.Scene, from: Point, look: ProjectileLook): Phaser.GameObjects.Text | Phaser.GameObjects.Arc {
  const color = look.color ?? DEFAULT_PROJECTILE_COLOR;
  if (!look.icon) {
    return scene.add.circle(from.x, from.y, 6, Phaser.Display.Color.HexStringToColor(color).color);
  }
  return addText(scene, from.x, from.y, look.icon, { fontSize: '24px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 5, padding: { x: 2, y: 4 } }).setOrigin(0.5);
}
