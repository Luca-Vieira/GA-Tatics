import Phaser from 'phaser';
import { addPanelBackground, addText, colorToCss, TEXT_COLORS, UI_DEPTH } from './theme';

export interface SynergyRowModel {
  readonly name: string;
  readonly color: number;
  readonly count: number;
  /** Contagens que ativam cada nível (ex.: [2, 4]). */
  readonly thresholds: readonly number[];
  /** Índice do nível ativo, ou -1. */
  readonly activeTierIndex: number;
  /** Efeitos do nível ativo (ou, sem nível ativo, do primeiro nível, como prévia). */
  readonly effectLines: readonly string[];
  readonly isPreview: boolean;
  /** Personagens que pertencem à sinergia na rotação vigente. */
  readonly memberNames: readonly string[];
}

export interface SynergyViewModel {
  readonly rows: readonly SynergyRowModel[];
  readonly rotationLabel: string;
}

const MAXIMUM_ROW_HEIGHT = 112;
/** Abaixo desta altura as linhas usam letras menores e uma disposição mais compacta (quando há 4 ou 5 sinergias). */
const COMPACT_ROW_HEIGHT = 100;
const HEADER_HEIGHT = 30;
const FOOTER_HEIGHT = 34;
const PADDING = 12;
/** Altura que o painel pode ocupar (a mesma do painel de detalhes, do outro lado do tabuleiro). */
const PANEL_MAXIMUM_HEIGHT = 462;

class SynergyRow {
  private readonly items: Phaser.GameObjects.GameObject[] = [];
  private readonly stripe: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly countText: Phaser.GameObjects.Text;
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly effectsText: Phaser.GameObjects.Text;
  private readonly membersText: Phaser.GameObjects.Text;
  private readonly pipOffsetY: number;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly width: number,
    rowHeight: number,
  ) {
    const isCompact = rowHeight < COMPACT_ROW_HEIGHT;
    this.pipOffsetY = isCompact ? 20 : 26;
    this.stripe = scene.add.rectangle(x + PADDING, y + 4, 5, rowHeight - 14, 0xffffff).setOrigin(0, 0).setDepth(UI_DEPTH);
    this.nameText = addText(scene, x + PADDING + 14, y + 2, '', { fontSize: isCompact ? '14px' : '16px', fontStyle: 'bold' }).setDepth(UI_DEPTH);
    this.countText = addText(scene, x + width - PADDING, y + 3, '', { fontSize: isCompact ? '13px' : '15px', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(UI_DEPTH);
    this.pips = scene.add.graphics().setDepth(UI_DEPTH);
    this.effectsText = addText(scene, x + PADDING + 14, y + (isCompact ? 31 : 40), '', {
      fontSize: isCompact ? '10px' : '11px',
      wordWrap: { width: width - PADDING * 2 - 14 },
      lineSpacing: 1,
    }).setDepth(UI_DEPTH);
    this.membersText = addText(scene, x + PADDING + 14, y + rowHeight - (isCompact ? 24 : 32), '', {
      fontSize: isCompact ? '9px' : '10px',
      color: TEXT_COLORS.muted,
      wordWrap: { width: width - PADDING * 2 - 14 },
    }).setDepth(UI_DEPTH);
    this.items.push(this.stripe, this.nameText, this.countText, this.pips, this.effectsText, this.membersText);
  }

  render(model: SynergyRowModel): void {
    const isActive = model.activeTierIndex >= 0;
    this.stripe.setFillStyle(model.color).setAlpha(isActive ? 1 : 0.45);
    this.nameText.setText(model.name).setColor(colorToCss(model.color));
    const nextThreshold = model.thresholds.find((threshold) => threshold > model.count);
    this.countText.setText(nextThreshold === undefined ? `${model.count}` : `${model.count}/${nextThreshold}`).setColor(isActive ? TEXT_COLORS.good : TEXT_COLORS.main);

    this.pips.clear();
    model.thresholds.forEach((_threshold, tier) => {
      const pipX = this.x + PADDING + 14 + tier * 58;
      const pipY = this.y + this.pipOffsetY;
      const lit = tier <= model.activeTierIndex;
      this.pips.fillStyle(lit ? model.color : 0x0b1220, 1);
      this.pips.fillRoundedRect(pipX, pipY, 52, 8, 3);
      this.pips.lineStyle(1, model.color, 0.7);
      this.pips.strokeRoundedRect(pipX, pipY, 52, 8, 3);
    });

    const prefix = model.isPreview ? `Com ${model.thresholds[0] ?? 0}: ` : '';
    this.effectsText.setText(model.effectLines.map((line, index) => (index === 0 ? `${prefix}${line}` : line)).join('\n')).setAlpha(isActive ? 1 : 0.6);
    this.membersText.setText(model.memberNames.join(', '));
  }

  destroy(): void {
    this.items.forEach((item) => item.destroy());
  }
}

/** Painel de sinergias: contagem por sinergia, nível ativo, bônus e contagem regressiva da rotação (GDD 4.6). */
export class SynergyPanel {
  private readonly items: Phaser.GameObjects.GameObject[] = [];
  private readonly rows: SynergyRow[];
  private readonly rotationText: Phaser.GameObjects.Text;

  /** `rowCount` é a quantidade de sinergias do jogo; a altura das linhas se ajusta para o painel caber na tela. */
  constructor(scene: Phaser.Scene, x: number, y: number, width: number, rowCount: number) {
    const rowHeight = Math.min(MAXIMUM_ROW_HEIGHT, Math.floor((PANEL_MAXIMUM_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT) / Math.max(1, rowCount)));
    const rowsHeight = HEADER_HEIGHT + rowCount * rowHeight;
    this.items.push(addPanelBackground(scene, x, y, width, rowsHeight + FOOTER_HEIGHT));
    this.items.push(addText(scene, x + PADDING, y + 8, 'Sinergias', { fontSize: '15px', fontStyle: 'bold' }).setDepth(UI_DEPTH));
    this.rows = Array.from({ length: rowCount }, (_, index) => new SynergyRow(scene, x, y + HEADER_HEIGHT + index * rowHeight, width, rowHeight));
    this.rotationText = addText(scene, x + PADDING, y + rowsHeight + 6, '', { fontSize: '11px', color: TEXT_COLORS.muted }).setDepth(UI_DEPTH);
    this.items.push(this.rotationText);
  }

  render(model: SynergyViewModel): void {
    this.rows.forEach((row, index) => {
      const rowModel = model.rows[index];
      if (rowModel) {
        row.render(rowModel);
      }
    });
    this.rotationText.setText(model.rotationLabel);
  }

  destroy(): void {
    this.items.forEach((item) => item.destroy());
    this.rows.forEach((row) => row.destroy());
  }
}
