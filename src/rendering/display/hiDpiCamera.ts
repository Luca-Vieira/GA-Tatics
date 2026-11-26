import type Phaser from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, renderScale } from './renderScale';

/** Aproxima a câmera para a cena continuar em 1280x720 num canvas maior. Pode ser chamada a cada quadro. */
export function applyHiDpiCamera(scene: Phaser.Scene): void {
  const camera = scene.cameras.main;
  const scale = renderScale();
  if (!camera || camera.zoom === scale) {
    return;
  }
  camera.setZoom(scale);
  camera.centerOn(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
}

/** Ponto do toque ou do mouse em unidades de tela (o `pointer.x` vem em pixels do canvas). */
export function pointerPosition(scene: Phaser.Scene, pointer: Phaser.Input.Pointer): { x: number; y: number } {
  const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  return { x: point.x, y: point.y };
}
