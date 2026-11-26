import Phaser from 'phaser';
import { bySize, isCompactDisplay } from '../layout/displayProfile';
import { SCREEN_WIDTH, TOP_BAR_HEIGHT } from '../layout/gameLayout';
import { setFittedText } from './fittedText';
import { addPanelBackground, addText, setTextColor, TEXT_COLORS, UI_DEPTH } from './theme';
import { chipSlots, type ChipSlot } from './topBarLayout';

export interface PlayerChipModel {
  readonly id: string;
  readonly name: string;
  readonly lives: number;
  readonly maximumLives: number;
  readonly isYou: boolean;
  readonly isEliminated: boolean;
  /** É o adversário do jogador na rodada atual. */
  readonly isOpponent: boolean;
}

export interface TopBarModel {
  readonly roundLabel: string;
  readonly phaseLabel: string;
  readonly timerLabel: string;
  readonly players: readonly PlayerChipModel[];
}

const CHIP_TOP = 6;
const CHIP_HEIGHT = 44;
const NARROW_CHIP_WIDTH = 120;
const TIMER_X = 358;
const PHASE_TEXT_WIDTH = 296;

class PlayerChip {
  private readonly hitArea: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly livesText: Phaser.GameObjects.Text;
  private playerId = '';

  constructor(scene: Phaser.Scene, onTap: (playerId: string) => void) {
    this.hitArea = scene.add.rectangle(0, CHIP_TOP, 10, CHIP_HEIGHT, 0xffffff, 0.001).setOrigin(0, 0).setDepth(UI_DEPTH + 2).setInteractive({ useHandCursor: true });
    this.hitArea.on('pointerdown', () => onTap(this.playerId));
    this.nameText = addText(scene, 0, 8, '', { fontSize: bySize('13px', '20px'), fontStyle: 'bold' }).setDepth(UI_DEPTH + 1);
    this.livesText = addText(scene, 0, 28, '', { fontSize: bySize('14px', '19px'), color: '#ef4444' }).setDepth(UI_DEPTH + 1);
  }

  render(player: PlayerChipModel, slot: ChipSlot, graphics: Phaser.GameObjects.Graphics): void {
    this.playerId = player.id;
    this.hitArea.setX(slot.x).setSize(slot.width, CHIP_HEIGHT);
    graphics.fillStyle(player.isYou ? 0x1d4ed8 : 0x0f1a30, player.isEliminated ? 0.4 : 1);
    graphics.fillRoundedRect(slot.x, CHIP_TOP, slot.width, CHIP_HEIGHT, 6);
    graphics.lineStyle(2, player.isOpponent ? 0xf97316 : 0x3b4d73, 1);
    graphics.strokeRoundedRect(slot.x, CHIP_TOP, slot.width, CHIP_HEIGHT, 6);

    const isNarrow = slot.width < NARROW_CHIP_WIDTH;
    this.nameText.setPosition(slot.x + 6, bySize(8, 6)).setAlpha(player.isEliminated ? 0.5 : 1);
    setFittedText(this.nameText, `${player.isOpponent ? '⚔ ' : ''}${player.name}`, slot.width - 10);
    this.livesText.setPosition(slot.x + 6, 28).setFontSize(isNarrow ? bySize(12, 15) : bySize(14, 19));
    this.livesText.setText(player.isEliminated ? 'Eliminado' : '♥'.repeat(player.lives) + '♡'.repeat(Math.max(0, player.maximumLives - player.lives)));
    setTextColor(this.livesText, player.isEliminated ? TEXT_COLORS.muted : '#ef4444');
  }
}

/** Barra superior: rodada, fase, cronômetro e vidas de todos os jogadores. Tocar numa ficha avisa a cena. */
export class TopBar {
  private readonly roundText: Phaser.GameObjects.Text;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly chipGraphics: Phaser.GameObjects.Graphics;
  private readonly chips: PlayerChip[] = [];
  private drawnChipsKey = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onChipTap: (playerId: string) => void,
  ) {
    addPanelBackground(scene, 0, 0, SCREEN_WIDTH, TOP_BAR_HEIGHT).setStrokeStyle(0);
    this.roundText = addText(scene, 16, bySize(6, 2), '', { fontSize: bySize('20px', '28px'), fontStyle: 'bold' }).setDepth(UI_DEPTH);
    this.phaseText = addText(scene, 16, bySize(32, 32), '', { fontSize: bySize('13px', '20px'), color: TEXT_COLORS.muted }).setDepth(UI_DEPTH);
    this.timerText = addText(scene, TIMER_X, bySize(8, 2), '', { fontSize: bySize('34px', '46px'), fontStyle: 'bold', color: TEXT_COLORS.gold }).setOrigin(0.5, 0).setDepth(UI_DEPTH);
    this.chipGraphics = scene.add.graphics().setDepth(UI_DEPTH);
  }

  render(model: TopBarModel): void {
    this.roundText.setText(model.roundLabel);
    // No modo compacto fica só o nome da fase (o adversário já aparece marcado no placar).
    const phaseLabel = isCompactDisplay() ? model.phaseLabel.split(' · ')[0]! : model.phaseLabel;
    setFittedText(this.phaseText, phaseLabel, PHASE_TEXT_WIDTH);
    this.timerText.setText(model.timerLabel);
    this.renderChips(model.players);
  }

  private renderChips(players: readonly PlayerChipModel[]): void {
    const key = JSON.stringify(players);
    if (key === this.drawnChipsKey) {
      return;
    }
    this.drawnChipsKey = key;
    const slots = chipSlots(players.length);
    this.chipGraphics.clear();
    players.forEach((player, index) => {
      this.chips[index] ??= new PlayerChip(this.scene, this.onChipTap);
      this.chips[index].render(player, slots[index]!, this.chipGraphics);
    });
  }
}
