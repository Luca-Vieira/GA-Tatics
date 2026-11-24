import Phaser from 'phaser';
import { COLORS, FONT_FAMILY, PANEL_DEPTH, TEXT_COLORS } from './palette';

export * from './palette';

export function addText(scene: Phaser.Scene, x: number, y: number, content: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
  return scene.add.text(x, y, content, { fontFamily: FONT_FAMILY, fontSize: '14px', color: TEXT_COLORS.main, ...style });
}

export function addPanelBackground(scene: Phaser.Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(x, y, width, height, COLORS.panel, 0.92)
    .setOrigin(0, 0)
    .setStrokeStyle(2, COLORS.panelBorder, 1)
    .setDepth(PANEL_DEPTH);
}
