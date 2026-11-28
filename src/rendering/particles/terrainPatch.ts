import Phaser from 'phaser';
import type { BoardProjection } from '@shared/utils/boardProjection';
import type { Hex } from '@shared/utils/hex';
import { drawCellOutline } from '../board/boardLayout';
import { bySize } from '../layout/displayProfile';
import { addText } from '../ui/theme';

/** Acima das lajotas e abaixo dos destaques, dos efeitos de ataque e dos personagens. */
const TERRAIN_DEPTH = -900;
const FILL_ALPHA = 0.42;
const FADE_MS = 280;

export interface TerrainLook {
  readonly center: Hex;
  readonly cells: readonly Hex[];
  readonly color: string;
  /** Cor do contorno: mostra de qual lado é o terreno. */
  readonly sideColor: number;
  readonly icon?: string;
}

/** Desenha um terreno no chão: casas pintadas, contornadas na cor do time, com o ícone na casa central. */
export function createTerrainPatch(scene: Phaser.Scene, projection: BoardProjection, look: TerrainLook): Phaser.GameObjects.Container {
  const fillColor = Phaser.Display.Color.HexStringToColor(look.color).color;
  const graphics = scene.add.graphics();
  for (const cell of look.cells) {
    drawCellOutline(graphics, projection, cell, fillColor, FILL_ALPHA, 2, 0);
    drawCellOutline(graphics, projection, cell, look.sideColor, 0, 2, 0.65);
  }
  const patch = scene.add.container(0, 0, [graphics]).setDepth(TERRAIN_DEPTH).setAlpha(0);
  if (look.icon) {
    const ground = projection.cellToGround(look.center);
    patch.add(addText(scene, ground.x, ground.y, look.icon, { fontSize: bySize('18px', '26px'), padding: { x: 2, y: 3 } }).setOrigin(0.5).setAlpha(0.9));
  }
  scene.tweens.add({ targets: patch, alpha: 1, duration: FADE_MS });
  return patch;
}

export function removeTerrainPatch(scene: Phaser.Scene, patch: Phaser.GameObjects.Container): void {
  scene.tweens.killTweensOf(patch);
  scene.tweens.add({ targets: patch, alpha: 0, duration: FADE_MS, onComplete: () => patch.destroy() });
}
