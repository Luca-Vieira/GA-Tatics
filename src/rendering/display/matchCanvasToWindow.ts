import Phaser from 'phaser';
import { canvasSizeFor, renderScale, updateRenderScaleFromWindow } from './renderScale';

/** Espera a janela parar de mudar antes de redesenhar (arrastar a borda dispara muitos avisos). */
const RESIZE_SETTLE_MS = 150;

/** Mantém o canvas com os mesmos pixels que o jogo ocupa na janela, também ao redimensionar, girar ou trocar de monitor. */
export function keepCanvasSharp(game: Phaser.Game): void {
  let pendingResize: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(pendingResize);
    pendingResize = setTimeout(() => matchCanvasToWindow(game), RESIZE_SETTLE_MS);
  });
}

function matchCanvasToWindow(game: Phaser.Game): void {
  if (!updateRenderScaleFromWindow()) {
    return;
  }
  const size = canvasSizeFor(renderScale());
  // Lê o tamanho novo da área antes, para o Phaser encaixar o canvas nela e não na antiga.
  game.scale.getParentBounds();
  game.scale.setGameSize(size.width, size.height);
  game.scene.getScenes(false).forEach((scene) => sharpenTexts(scene, renderScale()));
}

/** Os textos são imagens prontas: precisam ser redesenhados na resolução nova. */
function sharpenTexts(scene: Phaser.Scene, resolution: number): void {
  const pending: Phaser.GameObjects.GameObject[] = [...(scene.children?.list ?? [])];
  while (pending.length > 0) {
    const gameObject = pending.pop()!;
    if (gameObject instanceof Phaser.GameObjects.Text) {
      gameObject.setResolution(resolution);
    } else if (gameObject instanceof Phaser.GameObjects.Container) {
      pending.push(...gameObject.list);
    }
  }
}
