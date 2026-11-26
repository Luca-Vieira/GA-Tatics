import Phaser from 'phaser';
import { bySize, isCompactDisplay } from '../layout/displayProfile';
import { SYNERGY_PANEL } from '../layout/gameLayout';
import { addPanelBackground, addText, colorToCss, COLORS, setTextColor, TEXT_COLORS, UI_DEPTH } from './theme';

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

const PADDING = 8;
const HEADER_HEIGHT = 34;
const FOOTER_HEIGHT = 44;
const MAXIMUM_ROW_HEIGHT = 120;
/** Abaixo desta altura não cabe o texto dos efeitos na linha (fica só nos detalhes). */
const MINIMUM_ROW_HEIGHT_WITH_EFFECTS = 96;
const EFFECT_LINE_HEIGHT = 14;
const REGULAR_POPUP_WIDTH = 300;
const COMPACT_POPUP_WIDTH = 480;
const POPUP_PADDING = 12;
const POPUP_DEPTH = UI_DEPTH + 30;

interface SynergyRowCallbacks {
  readonly onTap: () => void;
  readonly onHover: (isHovering: boolean) => void;
}

class SynergyRow {
  private readonly items: Phaser.GameObjects.GameObject[] = [];
  private readonly stripe: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly countText: Phaser.GameObjects.Text;
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly effectsText: Phaser.GameObjects.Text;
  private readonly showsEffects: boolean;
  private model: SynergyRowModel | null = null;

  constructor(
    scene: Phaser.Scene,
    readonly top: number,
    height: number,
    callbacks: SynergyRowCallbacks,
  ) {
    const { x, width } = SYNERGY_PANEL;
    this.showsEffects = !isCompactDisplay() && height >= MINIMUM_ROW_HEIGHT_WITH_EFFECTS;
    const hitArea = scene.add.rectangle(x + 2, top, width - 4, height - 4, 0xffffff, 0.04).setOrigin(0, 0).setDepth(UI_DEPTH - 1).setInteractive({ useHandCursor: true });
    this.stripe = scene.add.rectangle(x + 5, top + 3, 4, height - 12, 0xffffff).setOrigin(0, 0).setDepth(UI_DEPTH);
    this.nameText = addText(scene, x + 16, top + 3, '', { fontSize: bySize('14px', '21px'), fontStyle: 'bold' }).setDepth(UI_DEPTH);
    this.countText = addText(scene, x + 16, top + bySize(22, 32), '', { fontSize: bySize('16px', '30px'), fontStyle: 'bold' }).setDepth(UI_DEPTH);
    this.pips = scene.add.graphics().setDepth(UI_DEPTH);
    const maximumEffectLines = Math.max(1, Math.floor((height - 50) / EFFECT_LINE_HEIGHT));
    this.effectsText = addText(scene, x + 16, top + 46, '', { fontSize: '11px', wordWrap: { width: width - 24 }, lineSpacing: 1, maxLines: maximumEffectLines }).setDepth(UI_DEPTH);
    this.items.push(hitArea, this.stripe, this.nameText, this.countText, this.pips, this.effectsText);

    hitArea.on('pointerdown', callbacks.onTap);
    hitArea.on('pointerover', (pointer: Phaser.Input.Pointer) => !pointer.wasTouch && callbacks.onHover(true));
    hitArea.on('pointerout', (pointer: Phaser.Input.Pointer) => !pointer.wasTouch && callbacks.onHover(false));
  }

  get currentModel(): SynergyRowModel | null {
    return this.model;
  }

  render(model: SynergyRowModel): void {
    this.model = model;
    const isActive = model.activeTierIndex >= 0;
    this.stripe.setFillStyle(model.color).setAlpha(isActive ? 1 : 0.45);
    this.nameText.setText(model.name);
    setTextColor(this.nameText, colorToCss(model.color));
    const nextThreshold = model.thresholds.find((threshold) => threshold > model.count);
    this.countText.setText(nextThreshold === undefined ? `${model.count}` : `${model.count}/${nextThreshold}`);
    setTextColor(this.countText, isActive ? TEXT_COLORS.good : TEXT_COLORS.main);
    this.drawPips(model);
    this.effectsText.setVisible(this.showsEffects);
    this.effectsText.setText(this.showsEffects ? effectsWithPrefix(model) : '').setAlpha(isActive ? 1 : 0.6);
  }

  destroy(): void {
    this.items.forEach((item) => item.destroy());
  }

  private drawPips(model: SynergyRowModel): void {
    const left = SYNERGY_PANEL.x + bySize(58, 76);
    const pipWidth = Math.floor((SYNERGY_PANEL.width - bySize(66, 84)) / Math.max(1, model.thresholds.length)) - 4;
    this.pips.clear();
    model.thresholds.forEach((_threshold, tier) => {
      const pipX = left + tier * (pipWidth + 4);
      const isLit = tier <= model.activeTierIndex;
      this.pips.fillStyle(isLit ? model.color : 0x0b1220, 1);
      const pipY = this.top + bySize(28, 42);
      this.pips.fillRoundedRect(pipX, pipY, pipWidth, 9, 3);
      this.pips.lineStyle(1, model.color, 0.7);
      this.pips.strokeRoundedRect(pipX, pipY, pipWidth, 9, 3);
    });
  }
}

function effectsWithPrefix(model: SynergyRowModel): string {
  const prefix = model.isPreview ? `Com ${model.thresholds[0] ?? 0}: ` : '';
  return model.effectLines.map((line, index) => (index === 0 ? `${prefix}${line}` : line)).join('\n');
}

/** Caixa ao lado da coluna com os efeitos e os membros da sinergia consultada. */
class SynergyPopup {
  private readonly width = bySize(REGULAR_POPUP_WIDTH, COMPACT_POPUP_WIDTH);
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const x = SYNERGY_PANEL.x + SYNERGY_PANEL.width + 8;
    this.background = scene.add.rectangle(x, 0, this.width, 80, COLORS.panel, 0.98).setOrigin(0, 0).setStrokeStyle(2, COLORS.panelBorder).setDepth(POPUP_DEPTH);
    this.titleText = addText(scene, x + POPUP_PADDING, 0, '', { fontSize: bySize('17px', '27px'), fontStyle: 'bold' }).setDepth(POPUP_DEPTH + 1);
    this.bodyText = addText(scene, x + POPUP_PADDING, 0, '', { fontSize: bySize('14px', '22px'), wordWrap: { width: this.width - POPUP_PADDING * 2 }, lineSpacing: 3 }).setDepth(POPUP_DEPTH + 1);
    this.hide();
  }

  show(model: SynergyRowModel, top: number): void {
    const preview = model.isPreview ? `Ainda inativa. Com ${model.thresholds[0] ?? 0} no tabuleiro:` : 'Ativa:';
    const levels = isCompactDisplay() ? [] : ['', `Níveis: ${model.thresholds.join(' e ')} unidades`];
    const body = [preview, ...model.effectLines.map((line) => `• ${line}`), ...levels, `Membros: ${model.memberNames.join(', ')}`];
    this.titleText.setText(model.name);
    setTextColor(this.titleText, colorToCss(model.color));
    this.bodyText.setText(body.join('\n'));
    const bodyTop = bySize(38, 50);
    const height = this.bodyText.height + bodyTop + 10;
    const clampedTop = Math.min(top, SYNERGY_PANEL.y + SYNERGY_PANEL.height - height);
    this.background.setY(clampedTop).setSize(this.width, height);
    this.titleText.setY(clampedTop + 10);
    this.bodyText.setY(clampedTop + bodyTop);
    [this.background, this.titleText, this.bodyText].forEach((item) => item.setVisible(true));
  }

  hide(): void {
    [this.background, this.titleText, this.bodyText].forEach((item) => item.setVisible(false));
  }

  destroy(): void {
    [this.background, this.titleText, this.bodyText].forEach((item) => item.destroy());
  }
}

/** Coluna de sinergias: contagem, nível ativo, bônus e contagem regressiva da rotação (GDD 4.6). */
export class SynergyPanel {
  private readonly items: Phaser.GameObjects.GameObject[] = [];
  private readonly rows: SynergyRow[];
  private readonly rotationText: Phaser.GameObjects.Text;
  private readonly popup: SynergyPopup;
  /** Linha cujos detalhes estão fixados por um toque. */
  private pinnedRow: number | null = null;
  private shownRow: number | null = null;

  /** `rowCount` é a quantidade de sinergias do jogo; a altura das linhas se ajusta para a coluna caber na tela. */
  constructor(scene: Phaser.Scene, rowCount: number) {
    const { x, y, width, height } = SYNERGY_PANEL;
    const rowHeight = Math.min(MAXIMUM_ROW_HEIGHT, Math.floor((height - HEADER_HEIGHT - FOOTER_HEIGHT) / Math.max(1, rowCount)));
    this.items.push(addPanelBackground(scene, x, y, width, height));
    this.items.push(addText(scene, x + PADDING, y + 5, 'Sinergias', { fontSize: bySize('14px', '21px'), fontStyle: 'bold' }).setDepth(UI_DEPTH));
    if (!isCompactDisplay()) {
      this.items.push(addText(scene, x + PADDING, y + 21, 'toque para detalhes', { fontSize: '11px', color: TEXT_COLORS.muted }).setDepth(UI_DEPTH));
    }
    this.rows = Array.from(
      { length: rowCount },
      (_, index) =>
        new SynergyRow(scene, y + HEADER_HEIGHT + index * rowHeight, rowHeight, {
          onTap: () => this.togglePinned(index),
          onHover: (isHovering) => this.showRow(isHovering ? index : this.pinnedRow),
        }),
    );
    this.rotationText = addText(scene, x + PADDING, y + height - FOOTER_HEIGHT + 6, '', { fontSize: '11px', color: TEXT_COLORS.muted, wordWrap: { width: width - PADDING * 2 } }).setDepth(UI_DEPTH);
    this.rotationText.setVisible(!isCompactDisplay());
    this.items.push(this.rotationText);
    this.popup = new SynergyPopup(scene);
  }

  render(model: SynergyViewModel): void {
    this.rows.forEach((row, index) => {
      const rowModel = model.rows[index];
      if (rowModel) {
        row.render(rowModel);
      }
    });
    this.rotationText.setText(model.rotationLabel.replace(' · ', '\n'));
    if (this.shownRow !== null) {
      this.showRow(this.shownRow);
    }
  }

  closeDetails(): void {
    this.pinnedRow = null;
    this.showRow(null);
  }

  destroy(): void {
    this.items.forEach((item) => item.destroy());
    this.rows.forEach((row) => row.destroy());
    this.popup.destroy();
  }

  private togglePinned(index: number): void {
    this.pinnedRow = this.pinnedRow === index ? null : index;
    this.showRow(this.pinnedRow);
  }

  private showRow(index: number | null): void {
    this.shownRow = index;
    const row = index === null ? undefined : this.rows[index];
    const model = row?.currentModel;
    if (!row || !model) {
      this.popup.hide();
      return;
    }
    this.popup.show(model, row.top);
  }
}
