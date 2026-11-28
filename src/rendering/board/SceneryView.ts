import Phaser from 'phaser';
import type { MatchScenery } from '@core/game/MatchSession';
import type { BoardProjection } from '@shared/utils/boardProjection';
import { paintBackground } from '@shared/scenery/mapPainting';
import { renderScale } from '../display/renderScale';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../display/renderScale';
import { BOARD_DEPTH, drawBoard } from './boardLayout';

const BACKGROUND_DEPTH = BOARD_DEPTH - 10;

/** O fundo e o tabuleiro do mapa da partida. A imagem de fundo, quando há, entra assim que termina de baixar. */
export class SceneryView {
  private background: Phaser.GameObjects.Image | null = null;
  private board: Phaser.GameObjects.Graphics | null = null;
  private shown: MatchScenery | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly projection: BoardProjection,
  ) {}

  show(scenery: MatchScenery): void {
    this.destroy();
    this.shown = scenery;
    this.board = this.scene.add.graphics();
    drawBoard(this.board, this.projection, scenery.map.tiles);
    this.paint(scenery);
    this.loadImage(scenery);
  }

  destroy(): void {
    this.background?.destroy();
    this.board?.destroy();
    this.background = null;
    this.board = null;
    this.shown = null;
  }

  /** A textura é desenhada na resolução do canvas, para o fundo não ficar borrado em telas grandes. */
  private paint(scenery: MatchScenery, image?: HTMLImageElement): void {
    const scale = renderScale();
    const key = `scenery:${JSON.stringify(scenery.map.background)}:${scale}:${image ? 'imagem' : 'base'}`;
    if (!this.scene.textures.exists(key)) {
      const texture = this.scene.textures.createCanvas(key, Math.ceil(LOGICAL_WIDTH * scale), Math.ceil(LOGICAL_HEIGHT * scale));
      if (!texture) {
        return;
      }
      texture.context.scale(scale, scale);
      paintBackground(texture.context, scenery.map.background, LOGICAL_WIDTH, LOGICAL_HEIGHT, image);
      texture.refresh();
    }
    this.background?.destroy();
    this.background = this.scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(LOGICAL_WIDTH, LOGICAL_HEIGHT).setDepth(BACKGROUND_DEPTH);
  }

  private loadImage(scenery: MatchScenery): void {
    if (!scenery.backgroundImageUrl) {
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      // A cena pode ter trocado de mapa (ou fechado) enquanto a imagem baixava.
      if (this.shown === scenery) {
        this.paint(scenery, image);
      }
    };
    image.src = scenery.backgroundImageUrl;
  }
}
