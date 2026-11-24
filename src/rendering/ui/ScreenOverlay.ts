import Phaser from 'phaser';
import { Button } from './Button';
import { COLORS, SCREEN_DEPTH, addText, TEXT_COLORS } from './theme';

export interface ScreenModel {
  readonly title: string;
  readonly titleColor: string;
  readonly lines: readonly string[];
  readonly buttonLabel: string;
}

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 340;

/** Tela por cima de tudo, com título, linhas de texto e um botão: usada no resultado da rodada e no fim da partida. */
export class ScreenOverlay {
  private readonly shade: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly button: Button;
  private onContinue: (() => void) | null = null;

  constructor(scene: Phaser.Scene, screenWidth: number, screenHeight: number) {
    const left = (screenWidth - PANEL_WIDTH) / 2;
    const top = (screenHeight - PANEL_HEIGHT) / 2;
    // A cortina intercepta cliques para nada por baixo reagir enquanto a tela está aberta.
    this.shade = scene.add.rectangle(0, 0, screenWidth, screenHeight, 0x000000, 0.6).setOrigin(0, 0).setDepth(SCREEN_DEPTH).setInteractive();
    this.panel = scene.add.rectangle(left, top, PANEL_WIDTH, PANEL_HEIGHT, COLORS.panel, 1).setOrigin(0, 0).setStrokeStyle(3, COLORS.panelBorder).setDepth(SCREEN_DEPTH + 1);
    this.titleText = addText(scene, screenWidth / 2, top + 24, '', { fontSize: '36px', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(SCREEN_DEPTH + 2);
    this.bodyText = addText(scene, screenWidth / 2, top + 84, '', { fontSize: '16px', color: TEXT_COLORS.main, align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0)
      .setDepth(SCREEN_DEPTH + 2);
    this.button = new Button(scene, {
      x: screenWidth / 2 - 130,
      y: top + PANEL_HEIGHT - 70,
      width: 260,
      height: 48,
      label: '',
      onClick: () => this.onContinue?.(),
      color: COLORS.go,
      hoverColor: COLORS.goHover,
      fontSize: 18,
    });
    this.button.setDepthOffset(SCREEN_DEPTH + 3);
    this.hide();
  }

  get isVisible(): boolean {
    return this.shade.visible;
  }

  show(model: ScreenModel, onContinue: () => void): void {
    this.onContinue = onContinue;
    [this.shade, this.panel, this.titleText, this.bodyText].forEach((item) => item.setVisible(true));
    this.shade.setInteractive();
    this.button.setVisible(true);
    this.update(model);
  }

  /** Atualiza o texto sem reabrir (ex.: a contagem regressiva no botão). */
  update(model: ScreenModel): void {
    this.titleText.setText(model.title).setColor(model.titleColor);
    this.bodyText.setText(model.lines.join('\n'));
    this.button.setLabel(model.buttonLabel);
  }

  hide(): void {
    this.onContinue = null;
    [this.shade, this.panel, this.titleText, this.bodyText].forEach((item) => item.setVisible(false));
    this.shade.disableInteractive();
    this.button.setVisible(false);
  }
}
