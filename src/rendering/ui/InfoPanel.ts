import Phaser from 'phaser';
import { bySize, isCompactDisplay } from '../layout/displayProfile';
import { INFO_PANEL_LEFT_X, INFO_PANEL_TOP, SCREEN_WIDTH } from '../layout/gameLayout';
import { Button } from './Button';
import { addText, colorToCss, COLORS, setTextColor, TEXT_COLORS, UI_DEPTH } from './theme';

export interface InfoStatLine {
  readonly label: string;
  /** Preenchimento da barra, de 0 a 10; `null` = linha sem barra. */
  readonly scaleValue: number | null;
  /** Valor de jogo, mostrado à direita da barra. */
  readonly displayValue: string;
}

export interface InfoModel {
  readonly title: string;
  readonly starLevel: number | null;
  readonly subtitle: string;
  readonly accentColor: number;
  readonly synergyName: string;
  readonly synergyColor: number;
  readonly synergyBonusText: string;
  readonly stats: readonly InfoStatLine[];
  /** Formato e alcance do ataque básico. */
  readonly attackText: string;
  /** Características: critério de alvo, movimento, invocação etc. */
  readonly traitText: string;
  /** Estados ativos durante o combate (vazio fora dele). */
  readonly statusText: string;
  readonly abilityName: string;
  readonly abilityDescription: string;
  readonly cooldownText: string;
  /** Moedas ao vender; `null` quando não dá para vender a partir do painel. */
  readonly sellValue: number | null;
}

export type PanelSide = 'left' | 'right';

export interface InfoPanelCallbacks {
  readonly onSell: () => void;
  readonly onClose: () => void;
}

const PADDING = 12;
const MAXIMUM_STAT_LINES = 6;
const MAXIMUM_STAT_SCALE = 10;

/** Medidas e letras do painel. No modo compacto ele é mais largo, tem letras maiores e esconde o que é secundário. */
const REGULAR = {
  width: 318, statLine: 18, barX: 84, barWidth: 88, barHeight: 8, close: 40, sellHeight: 44, sellFont: 15, closeFont: 18,
  titleFont: '20px', smallFont: '12px', noteFont: '11px', textFont: '12px', abilityFont: '14px', synergyFont: '13px',
  subtitleTop: 38, headerBottom: 60, synergyLine: 18, abilityLine: 22,
};
const COMPACT: typeof REGULAR = {
  width: 500, statLine: 29, barX: 150, barWidth: 170, barHeight: 14, close: 62, sellHeight: 64, sellFont: 25, closeFont: 28,
  titleFont: '31px', smallFont: '20px', noteFont: '19px', textFont: '21px', abilityFont: '24px', synergyFont: '21px',
  subtitleTop: 50, headerBottom: 82, synergyLine: 28, abilityLine: 33,
};
const PANEL_DEPTH_OFFSET = UI_DEPTH + 20;

/**
 * Detalhes de um personagem, flutuando sobre o tabuleiro: carta da loja, unidade na preparação ou unidade lutando
 * (com os valores ao vivo). A altura acompanha o conteúdo.
 */
export class InfoPanel {
  private readonly size = bySize(REGULAR, COMPACT);
  private readonly isCompact = isCompactDisplay();
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly accent: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly starText: Phaser.GameObjects.Text;
  private readonly subtitleText: Phaser.GameObjects.Text;
  private readonly synergyText: Phaser.GameObjects.Text;
  private readonly synergyBonusText: Phaser.GameObjects.Text;
  private readonly statBars: Phaser.GameObjects.Graphics;
  private readonly statLabels: Phaser.GameObjects.Text[] = [];
  private readonly statValues: Phaser.GameObjects.Text[] = [];
  private readonly attackText: Phaser.GameObjects.Text;
  private readonly traitText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly abilityNameText: Phaser.GameObjects.Text;
  private readonly cooldownText: Phaser.GameObjects.Text;
  private readonly abilityDescriptionText: Phaser.GameObjects.Text;
  private readonly sellButton: Button;
  private readonly closeButton: Button;
  private readonly items: readonly (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible)[];

  constructor(scene: Phaser.Scene, callbacks: InfoPanelCallbacks) {
    const size = this.size;
    const innerWidth = size.width - PADDING * 2;
    const text = (style: Phaser.Types.GameObjects.Text.TextStyle) => addText(scene, 0, 0, '', style).setDepth(PANEL_DEPTH_OFFSET + 1);
    const wrapped = (style: Phaser.Types.GameObjects.Text.TextStyle) => text({ wordWrap: { width: innerWidth }, ...style });

    // O fundo é interativo para os toques no painel não chegarem ao tabuleiro por baixo.
    this.background = scene.add.rectangle(0, 0, size.width, 100, COLORS.panel, 0.97).setOrigin(0, 0).setStrokeStyle(2, COLORS.panelBorder).setDepth(PANEL_DEPTH_OFFSET).setInteractive();
    this.accent = scene.add.rectangle(0, 0, size.width, 6, 0xffffff).setOrigin(0, 0).setDepth(PANEL_DEPTH_OFFSET + 1);
    this.titleText = text({ fontSize: size.titleFont, fontStyle: 'bold' });
    this.starText = text({ fontSize: size.synergyFont, color: TEXT_COLORS.gold }).setOrigin(1, 0);
    this.subtitleText = wrapped({ fontSize: size.smallFont, color: TEXT_COLORS.muted, wordWrap: { width: innerWidth - size.close } });
    this.synergyText = text({ fontSize: size.synergyFont, fontStyle: 'bold' });
    this.synergyBonusText = wrapped({ fontSize: size.noteFont, color: TEXT_COLORS.muted });
    this.statBars = scene.add.graphics().setDepth(PANEL_DEPTH_OFFSET + 1);
    for (let line = 0; line < MAXIMUM_STAT_LINES; line++) {
      this.statLabels.push(text({ fontSize: size.smallFont, color: TEXT_COLORS.muted }));
      this.statValues.push(text({ fontSize: size.smallFont, fontStyle: 'bold' }).setOrigin(1, 0));
    }
    this.attackText = wrapped({ fontSize: size.textFont, color: '#7dd3fc' });
    this.traitText = wrapped({ fontSize: size.noteFont, color: TEXT_COLORS.muted });
    this.statusText = wrapped({ fontSize: size.textFont, color: TEXT_COLORS.gold });
    this.abilityNameText = text({ fontSize: size.abilityFont, fontStyle: 'bold', color: '#fde68a', padding: { y: 2 } });
    this.cooldownText = text({ fontSize: size.noteFont, color: TEXT_COLORS.muted }).setOrigin(1, 0);
    this.abilityDescriptionText = wrapped({ fontSize: size.textFont, lineSpacing: 1 });

    this.sellButton = new Button(scene, { x: 0, y: 0, width: innerWidth, height: size.sellHeight, label: 'Vender', onClick: callbacks.onSell, color: COLORS.danger, hoverColor: 0xef4444, fontSize: size.sellFont });
    this.closeButton = new Button(scene, { x: 0, y: 0, width: size.close, height: size.close, label: '✕', onClick: callbacks.onClose, color: 0x334155, hoverColor: 0x475569, fontSize: size.closeFont });
    this.sellButton.setDepthOffset(PANEL_DEPTH_OFFSET + 2);
    this.closeButton.setDepthOffset(PANEL_DEPTH_OFFSET + 2);

    this.items = [
      this.background,
      this.accent,
      this.titleText,
      this.starText,
      this.subtitleText,
      this.synergyText,
      this.synergyBonusText,
      this.statBars,
      ...this.statLabels,
      ...this.statValues,
      this.attackText,
      this.traitText,
      this.statusText,
      this.abilityNameText,
      this.cooldownText,
      this.abilityDescriptionText,
    ];
    this.hide();
  }

  hide(): void {
    this.items.forEach((item) => item.setVisible(false));
    this.background.disableInteractive();
    this.sellButton.setVisible(false);
    this.closeButton.setVisible(false);
  }

  show(model: InfoModel, side: PanelSide): void {
    const panelX = side === 'left' ? INFO_PANEL_LEFT_X : SCREEN_WIDTH - this.size.width - 8;
    this.items.forEach((item) => item.setVisible(true));
    this.background.setInteractive();
    this.closeButton.setVisible(true);
    this.closeButton.setPosition(panelX + this.size.width - this.size.close - 6, INFO_PANEL_TOP + 10);

    let cursorY = this.layoutHeader(model, panelX);
    cursorY = this.layoutStats(model, panelX, cursorY);
    cursorY = this.layoutTexts(model, panelX, cursorY);
    cursorY = this.layoutAbility(model, panelX, cursorY);
    cursorY = this.layoutSellButton(model, panelX, cursorY);
    this.background.setPosition(panelX, INFO_PANEL_TOP);
    // Redimensionar a forma também ajusta a área que recebe toques.
    this.background.setSize(this.size.width, cursorY - INFO_PANEL_TOP + 8);
  }

  private layoutHeader(model: InfoModel, x: number): number {
    const left = x + PADDING;
    this.accent.setPosition(x, INFO_PANEL_TOP).setFillStyle(model.accentColor);
    this.titleText.setPosition(left, INFO_PANEL_TOP + 12).setText(model.title);
    this.starText.setPosition(x + this.size.width - this.size.close - 16, INFO_PANEL_TOP + 15).setText('★'.repeat(model.starLevel ?? 0));
    this.subtitleText.setPosition(left, INFO_PANEL_TOP + this.size.subtitleTop).setText(model.subtitle);
    let cursorY = Math.max(this.subtitleText.y + this.subtitleText.height + 6, INFO_PANEL_TOP + this.size.headerBottom);
    this.synergyText.setPosition(left, cursorY).setText(model.synergyName ? `◆ ${model.synergyName}` : '');
    setTextColor(this.synergyText, colorToCss(model.synergyColor));
    cursorY += model.synergyName ? this.size.synergyLine : 0;
    const bonusText = this.isCompact ? '' : model.synergyBonusText;
    this.synergyBonusText.setPosition(left, cursorY).setText(bonusText);
    return cursorY + (bonusText ? this.synergyBonusText.height + 6 : 0);
  }

  private layoutStats(model: InfoModel, x: number, top: number): number {
    this.statBars.clear();
    for (let line = 0; line < MAXIMUM_STAT_LINES; line++) {
      const stat = model.stats[line];
      const lineY = top + line * this.size.statLine;
      this.statLabels[line]?.setPosition(x + PADDING, lineY).setText(stat?.label ?? '');
      this.statValues[line]?.setPosition(x + this.size.width - PADDING, lineY).setText(stat?.displayValue ?? '');
      if (stat && stat.scaleValue !== null) {
        this.drawStatBar(x + this.size.barX, lineY + 4, stat.scaleValue, model.accentColor);
      }
    }
    return top + Math.min(model.stats.length, MAXIMUM_STAT_LINES) * this.size.statLine + 4;
  }

  private drawStatBar(x: number, y: number, scaleValue: number, color: number): void {
    const { barWidth, barHeight } = this.size;
    const filled = (barWidth * Math.min(Math.max(scaleValue, 0), MAXIMUM_STAT_SCALE)) / MAXIMUM_STAT_SCALE;
    this.statBars.fillStyle(0x0b1220, 1);
    this.statBars.fillRect(x, y, barWidth, barHeight);
    this.statBars.fillStyle(color, 1);
    this.statBars.fillRect(x, y, filled, barHeight);
  }

  private layoutTexts(model: InfoModel, x: number, top: number): number {
    let cursorY = top;
    const blocks: readonly [Phaser.GameObjects.Text, string][] = [
      // No modo compacto fica só o nome do formato (a área aparece pintada no tabuleiro) e some o texto de comportamento.
      [this.attackText, this.isCompact && model.attackText ? `Área: ${model.attackText.split(':')[0]}` : model.attackText],
      [this.traitText, this.isCompact ? '' : model.traitText],
      [this.statusText, model.statusText],
    ];
    for (const [block, content] of blocks) {
      block.setPosition(x + PADDING, cursorY).setText(content);
      cursorY += content ? block.height + 4 : 0;
    }
    return cursorY;
  }

  private layoutAbility(model: InfoModel, x: number, top: number): number {
    this.abilityNameText.setPosition(x + PADDING, top).setText(model.abilityName);
    this.cooldownText.setPosition(x + this.size.width - PADDING, top + 4).setText(this.isCompact ? '' : model.cooldownText);
    this.abilityDescriptionText.setPosition(x + PADDING, top + this.size.abilityLine).setText(model.abilityDescription);
    return top + this.size.abilityLine + this.abilityDescriptionText.height;
  }

  private layoutSellButton(model: InfoModel, x: number, top: number): number {
    this.sellButton.setVisible(model.sellValue !== null);
    if (model.sellValue === null) {
      return top;
    }
    this.sellButton.setPosition(x + PADDING, top + 8);
    this.sellButton.setLabel(`Vender  (+${model.sellValue} ●)`);
    return top + 8 + this.size.sellHeight;
  }
}
