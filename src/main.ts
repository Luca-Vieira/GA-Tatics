import Phaser from 'phaser';
import { gameAudio, mountAudioControls } from '@rendering/audio';
import { applyHiDpiCamera } from '@rendering/display/hiDpiCamera';
import { keepCanvasSharp } from '@rendering/display/matchCanvasToWindow';
import { canvasSizeFor, renderScale } from '@rendering/display/renderScale';
import { GameScene } from '@rendering/scenes/GameScene';
import { LobbyScene } from '@rendering/scenes/LobbyScene';

const initialCanvasSize = canvasSizeFor(renderScale());

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1220',
  // O saguão usa campos de texto do navegador (nome, endereço, código da sala).
  dom: { createContainer: true },
  // O toque longo numa carta mostra detalhes: o menu do navegador não pode abrir por cima.
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Mantém o canvas em posições e tamanhos de pixel inteiro: meio pixel de sobra já borra o texto.
    autoRound: true,
    // Os mesmos pixels que o jogo ocupa na janela (ver `renderScale.ts`).
    width: initialCanvasSize.width,
    height: initialCanvasSize.height,
  },
  scene: [LobbyScene, GameScene],
});

// Toda cena ativa enxerga a mesma área de 1280x720, qualquer que seja o tamanho do canvas.
game.events.on(Phaser.Core.Events.PRE_RENDER, () => game.scene.getScenes(true).forEach(applyHiDpiCamera));

keepCanvasSharp(game);
mountAudioControls();
gameAudio.startMusic();

// Apenas em desenvolvimento: permite inspecionar o jogo pelo console do navegador.
if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
