import Phaser from 'phaser';
import { UNIT_BODY_TEXTURE, UNIT_BODY_TEXTURE_HEIGHT, UNIT_BODY_TEXTURE_WIDTH } from './UnitView';

/** Sprite provisório em formato de cápsula, de pé; será substituído pelos sprites reais dos personagens. */
export function ensureUnitBodyTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(UNIT_BODY_TEXTURE)) {
    return;
  }
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  const width = UNIT_BODY_TEXTURE_WIDTH;
  const height = UNIT_BODY_TEXTURE_HEIGHT;
  graphics.fillStyle(0xffffff, 1);
  graphics.fillRoundedRect(2, 2, width - 4, height - 4, width / 2 - 2);
  graphics.lineStyle(3, 0x000000, 0.5);
  graphics.strokeRoundedRect(2, 2, width - 4, height - 4, width / 2 - 2);
  graphics.generateTexture(UNIT_BODY_TEXTURE, width, height);
  graphics.destroy();
}
