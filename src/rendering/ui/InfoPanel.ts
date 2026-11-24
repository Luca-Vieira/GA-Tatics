import Phaser from 'phaser';
import { Button } from './Button';
import { addPanelBackground, addText, colorToCss, COLORS, TEXT_COLORS, UI_DEPTH } from './theme';

export interface InfoStatLine {
  readonly label: string;
  /** Valor na escala de 1 a 10, desenhado como barra. */
  readonly scaleValue: number;
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
  readonly abilityName: string;
  readonly abilityDescription: string;
  readonly cooldownText: string;
  /** Moedas ao vender; `null` quando a carta é só uma prévia (oferta da loja). */
  readonly sellValue: number | null;
}

const PANEL_PADDING = 14;
const MAXIMUM_STAT_SCALE = 10;
const BAR_WIDTH = 96;
const MAXIMUM_STAT_LINES = 5;
/** Distância do topo do painel até a primeira linha de atributos (depois do texto de sinergia, que pode ter 4 linhas). */
const STATS_TOP = 156;
const ABILITY_TOP = STATS_TOP + 108;

/** Painel de detalhes do personagem: atributos, habilidade e sinergia. Mostra a unidade selecionada ou a oferta sob o mouse. */
export class InfoPanel {
  private readonly items: Phaser.GameObjects.GameObject[] = [];
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly starText: Phaser.GameObjects.Text;
  private readonly subtitleText: Phaser.GameObjects.Text;
  private readonly synergyText: Phaser.GameObjects.Text;
  private readonly synergyBonusText: Phaser.GameObjects.Text;
  private readonly statLabels: Phaser.GameObjects.Text[] = [];
  private readonly statValues: Phaser.GameObjects.Text[] = [];
  private readonly statBars: Phaser.GameObjects.Graphics;
  private readonly abilityNameText: Phaser.GameObjects.Text;
  private readonly abilityDescriptionText: Phaser.GameObjects.Text;
  private readonly cooldownText: Phaser.GameObjects.Text;
  private readonly sellButton: Button;
  private readonly emptyText: Phaser.GameObjects.Text;
  private readonly accent: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    width: number,
    height: number,
    onSell: () => void,
  ) {
    addPanelBackground(scene, x, y, width, height);
    const innerX = x + PANEL_PADDING;
    const innerWidth = width - PANEL_PADDING * 2;
    const track = (item: Phaser.GameObjects.GameObject) => {
      this.items.push(item);
      return item;
    };

    this.accent = track(scene.add.rectangle(x, y, width, 6, 0xffffff).setOrigin(0, 0).setDepth(UI_DEPTH)) as Phaser.GameObjects.Rectangle;
    this.titleText = track(addText(scene, innerX, y + 16, '', { fontSize: '20px', fontStyle: 'bold' }).setDepth(UI_DEPTH)) as Phaser.GameObjects.Text;
    this.starText = track(addText(scene, x + width - PANEL_PADDING, y + 18, '', { fontSize: '16px', color: TEXT_COLORS.gold }).setOrigin(1, 0).setDepth(UI_DEPTH)) as Phaser.GameObjects.Text;
    this.subtitleText = track(addText(scene, innerX, y + 44, '', { fontSize: '12px', color: TEXT_COLORS.muted }).setDepth(UI_DEPTH)) as Phaser.GameObjects.Text;
    this.synergyText = track(addText(scene, innerX, y + 64, '', { fontSize: '13px', fontStyle: 'bold' }).setDepth(UI_DEPTH)) as Phaser.GameObjects.Text;
    this.synergyBonusText = track(
      addText(scene, innerX, y + 82, '', { fontSize: '11px', color: TEXT_COLORS.muted, wordWrap: { width: innerWidth } }).setDepth(UI_DEPTH),
    ) as Phaser.GameObjects.Text;

    this.statBars = track(scene.add.graphics().setDepth(UI_DEPTH)) as Phaser.GameObjects.Graphics;
    for (let line = 0; line < MAXIMUM_STAT_LINES; line++) {
      const lineY = y + STATS_TOP + line * 19;
      this.statLabels.push(track(addText(scene, innerX, lineY, '', { fontSize: '12px', color: TEXT_COLORS.muted }).setDepth(UI_DEPTH)) as Phaser.GameObjects.Text);
      this.statValues.push(track(addText(scene, x + width - PANEL_PADDING, lineY, '', { fontSize: '12px' }).setOrigin(1, 0).setDepth(UI_DEPTH)) as Phaser.GameObjects.Text);
    }

    this.abilityNameText = track(addText(scene, innerX, y + ABILITY_TOP, '', { fontSize: '14px', fontStyle: 'bold', color: '#fde68a' }).setDepth(UI_DEPTH)) as Phaser.GameObjects.Text;
    this.cooldownText = track(addText(scene, x + width - PANEL_PADDING, y + ABILITY_TOP + 2, '', { fontSize: '11px', color: TEXT_COLORS.muted }).setOrigin(1, 0).setDepth(UI_DEPTH)) as Phaser.GameObjects.Text;
    this.abilityDescriptionText = track(
      addText(scene, innerX, y + ABILITY_TOP + 22, '', { fontSize: '12px', wordWrap: { width: innerWidth }, lineSpacing: 2 }).setDepth(UI_DEPTH),
    ) as Phaser.GameObjects.Text;

    this.emptyText = addText(scene, x + width / 2, y + height / 2, 'Clique numa unidade\nou passe o mouse numa\ncarta da loja para\nver os detalhes.', {
      fontSize: '14px',
      color: TEXT_COLORS.muted,
      align: 'center',
    })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH);

    this.sellButton = new Button(scene, { x: innerX, y: y + height - 54, width: innerWidth, height: 40, label: 'Vender', onClick: onSell, color: COLORS.danger, hoverColor: 0xef4444, fontSize: 15 });
    this.render(null);
  }

  render(model: InfoModel | null): void {
    this.items.forEach((item) => (item as Phaser.GameObjects.GameObject & { setVisible: (visible: boolean) => unknown }).setVisible(model !== null));
    this.emptyText.setVisible(model === null);
    this.sellButton.setVisible(model !== null && model.sellValue !== null);
    if (model === null) {
      return;
    }

    this.accent.setFillStyle(model.accentColor);
    this.titleText.setText(model.title);
    this.starText.setText('★'.repeat(model.starLevel ?? 0));
    this.subtitleText.setText(model.subtitle);
    this.synergyText.setText(`◆ ${model.synergyName}`).setColor(colorToCss(model.synergyColor));
    this.synergyBonusText.setText(model.synergyBonusText);
    this.renderStats(model);
    this.abilityNameText.setText(model.abilityName);
    this.cooldownText.setText(model.cooldownText);
    this.abilityDescriptionText.setText(model.abilityDescription);
    if (model.sellValue !== null) {
      this.sellButton.setLabel(`Vender  (+${model.sellValue} ●)`);
    }
  }

  private renderStats(model: InfoModel): void {
    this.statBars.clear();
    const barX = this.x + 82;
    for (let line = 0; line < MAXIMUM_STAT_LINES; line++) {
      const stat = model.stats[line];
      this.statLabels[line]?.setText(stat?.label ?? '');
      this.statValues[line]?.setText(stat?.displayValue ?? '');
      if (!stat) {
        continue;
      }
      const barY = this.y + STATS_TOP + line * 19 + 4;
      this.statBars.fillStyle(0x0b1220, 1);
      this.statBars.fillRect(barX, barY, BAR_WIDTH, 8);
      this.statBars.fillStyle(model.accentColor, 1);
      this.statBars.fillRect(barX, barY, (BAR_WIDTH * Math.min(stat.scaleValue, MAXIMUM_STAT_SCALE)) / MAXIMUM_STAT_SCALE, 8);
    }
  }
}
