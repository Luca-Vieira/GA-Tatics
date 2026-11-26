import Phaser from 'phaser';
import { bySize } from '../layout/displayProfile';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../layout/gameLayout';
import { Button } from './Button';
import { COLORS, SCREEN_DEPTH, addText, setTextColor, TEXT_COLORS } from './theme';

export interface ScreenModel {
  readonly title: string;
  readonly titleColor: string;
  readonly lines: readonly string[];
  readonly buttonLabel: string;
  /** Segundo botão, ao lado do principal (ex.: "Continuar jogando" na confirmação de saída). */
  readonly secondaryButtonLabel?: string;
}

export interface ScreenOverlayOptions {
  /** Quanto acima das telas comuns esta fica (a confirmação de saída fica por cima do resultado). */
  readonly depthOffset?: number;
  readonly buttonColor?: number;
  readonly buttonHoverColor?: number;
}

const REGULAR = { panelWidth: 600, buttonWidth: 260, buttonHeight: 58, buttonFont: 19, bodyTop: 80, footer: 90 };
const COMPACT = { panelWidth: 880, buttonWidth: 380, buttonHeight: 84, buttonFont: 30, bodyTop: 100, footer: 116 };
const MINIMUM_PANEL_HEIGHT = 320;
const MAXIMUM_PANEL_HEIGHT = SCREEN_HEIGHT - 16;
const BUTTON_GAP = 16;

/** Tela por cima de tudo, com título, linhas de texto e botões: resultado da rodada, fim de partida e confirmações. */
export class ScreenOverlay {
  private readonly size = bySize(REGULAR, COMPACT);
  private readonly shade: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly button: Button;
  private readonly secondaryButton: Button;
  private onContinue: (() => void) | null = null;
  private onSecondary: (() => void) | null = null;

  constructor(scene: Phaser.Scene, options: ScreenOverlayOptions = {}) {
    const depth = SCREEN_DEPTH + (options.depthOffset ?? 0);
    // A cortina intercepta cliques para nada por baixo reagir enquanto a tela está aberta.
    this.shade = scene.add.rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, 0x000000, 0.6).setOrigin(0, 0).setDepth(depth).setInteractive();
    this.panel = scene.add.rectangle((SCREEN_WIDTH - this.size.panelWidth) / 2, 0, this.size.panelWidth, MINIMUM_PANEL_HEIGHT, COLORS.panel, 1).setOrigin(0, 0).setStrokeStyle(3, COLORS.panelBorder).setDepth(depth + 1);
    this.titleText = addText(scene, SCREEN_WIDTH / 2, 0, '', { fontSize: bySize('36px', '48px'), fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(depth + 2);
    this.bodyText = addText(scene, SCREEN_WIDTH / 2, 0, '', { fontSize: bySize('17px', '26px'), color: TEXT_COLORS.main, align: 'center', lineSpacing: 5, wordWrap: { width: this.size.panelWidth - 40 } })
      .setOrigin(0.5, 0)
      .setDepth(depth + 2);
    this.button = this.createButton(scene, depth, () => this.onContinue?.(), options.buttonColor ?? COLORS.go, options.buttonHoverColor ?? COLORS.goHover);
    this.secondaryButton = this.createButton(scene, depth, () => this.onSecondary?.(), 0x475569, 0x64748b);
    this.hide();
  }

  get isVisible(): boolean {
    return this.shade.visible;
  }

  show(model: ScreenModel, onContinue: () => void, onSecondary?: () => void): void {
    this.onContinue = onContinue;
    this.onSecondary = onSecondary ?? null;
    [this.shade, this.panel, this.titleText, this.bodyText].forEach((item) => item.setVisible(true));
    this.shade.setInteractive();
    this.button.setVisible(true);
    this.secondaryButton.setVisible(model.secondaryButtonLabel !== undefined);
    this.update(model);
  }

  /** Atualiza o texto sem reabrir (ex.: a contagem regressiva no botão). */
  update(model: ScreenModel): void {
    this.titleText.setText(model.title);
    setTextColor(this.titleText, model.titleColor);
    this.bodyText.setText(model.lines.join('\n'));
    this.button.setLabel(model.buttonLabel);
    this.secondaryButton.setLabel(model.secondaryButtonLabel ?? '');
    this.layout(model.secondaryButtonLabel !== undefined);
  }

  hide(): void {
    this.onContinue = null;
    this.onSecondary = null;
    [this.shade, this.panel, this.titleText, this.bodyText].forEach((item) => item.setVisible(false));
    this.shade.disableInteractive();
    this.button.setVisible(false);
    this.secondaryButton.setVisible(false);
  }

  private createButton(scene: Phaser.Scene, depth: number, onClick: () => void, color: number, hoverColor: number): Button {
    const button = new Button(scene, { x: 0, y: 0, width: this.size.buttonWidth, height: this.size.buttonHeight, label: '', onClick, color, hoverColor, fontSize: this.size.buttonFont });
    button.setDepthOffset(depth + 3);
    return button;
  }

  /** O painel cresce com o texto (oito jogadores geram várias linhas). */
  private layout(hasSecondaryButton: boolean): void {
    const { panelWidth, buttonWidth, buttonHeight, bodyTop, footer } = this.size;
    const wanted = bodyTop + this.bodyText.height + footer;
    const height = Math.min(Math.max(wanted, MINIMUM_PANEL_HEIGHT), MAXIMUM_PANEL_HEIGHT);
    const top = (SCREEN_HEIGHT - height) / 2;
    this.panel.setY(top).setSize(panelWidth, height);
    this.titleText.setY(top + 22);
    this.bodyText.setY(top + bodyTop);
    const buttonY = top + height - buttonHeight - 16;
    if (!hasSecondaryButton) {
      this.button.setPosition((SCREEN_WIDTH - buttonWidth) / 2, buttonY);
      return;
    }
    this.button.setPosition(SCREEN_WIDTH / 2 + BUTTON_GAP / 2, buttonY);
    this.secondaryButton.setPosition(SCREEN_WIDTH / 2 - buttonWidth - BUTTON_GAP / 2, buttonY);
  }
}
