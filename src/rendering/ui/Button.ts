import Phaser from 'phaser';
import { addText, COLORS, UI_DEPTH } from './theme';

export interface ButtonOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly onClick: () => void;
  readonly color?: number;
  readonly hoverColor?: number;
  readonly fontSize?: number;
}

/** Botão retangular simples: fundo, texto e clique (ou toque). Fica acima de tudo na interface. */
export class Button {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private color: number;
  private hoverColor: number;
  private isEnabled = true;

  constructor(
    scene: Phaser.Scene,
    private readonly options: ButtonOptions,
  ) {
    this.color = options.color ?? COLORS.button;
    this.hoverColor = options.hoverColor ?? COLORS.buttonHover;
    this.background = scene.add
      .rectangle(options.x, options.y, options.width, options.height, this.color)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.25)
      .setDepth(UI_DEPTH)
      .setInteractive({ useHandCursor: true });
    this.label = addText(scene, options.x + options.width / 2, options.y + options.height / 2, options.label, {
      fontSize: `${options.fontSize ?? 16}px`,
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
    })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH + 1);

    this.background.on('pointerover', () => this.paint(true));
    this.background.on('pointerout', () => this.paint(false));
    this.background.on('pointerdown', () => {
      if (this.isEnabled) {
        options.onClick();
      }
    });
  }

  setLabel(label: string): void {
    this.label.setText(label);
  }

  setEnabled(isEnabled: boolean): void {
    if (isEnabled !== this.isEnabled) {
      this.isEnabled = isEnabled;
      this.paint(false);
    }
  }

  setPosition(x: number, y: number): void {
    this.background.setPosition(x, y);
    this.label.setPosition(x + this.options.width / 2, y + this.options.height / 2);
  }

  /** Muda a profundidade para o botão ficar acima de telas que cobrem a interface. */
  setDepthOffset(depth: number): void {
    this.background.setDepth(depth);
    this.label.setDepth(depth + 1);
  }

  setVisible(isVisible: boolean): void {
    if (isVisible === this.background.visible) {
      return;
    }
    this.background.setVisible(isVisible);
    this.label.setVisible(isVisible);
    if (isVisible) {
      this.background.setInteractive({ useHandCursor: true });
    } else {
      this.background.disableInteractive();
    }
  }

  destroy(): void {
    this.background.destroy();
    this.label.destroy();
  }

  private paint(isHovered: boolean): void {
    if (!this.isEnabled) {
      this.background.setFillStyle(COLORS.buttonDisabled);
      this.label.setAlpha(0.6);
      return;
    }
    this.label.setAlpha(1);
    this.background.setFillStyle(isHovered ? this.hoverColor : this.color);
  }
}
