import Phaser from 'phaser';
import { GameScene } from '@rendering/scenes/GameScene';
import { LobbyScene } from '@rendering/scenes/LobbyScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1220',
  // O saguão usa campos de texto do navegador (nome, endereço, código da sala).
  dom: { createContainer: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [LobbyScene, GameScene],
});

// Apenas em desenvolvimento: permite inspecionar o jogo pelo console do navegador.
if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
