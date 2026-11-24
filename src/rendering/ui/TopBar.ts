import Phaser from 'phaser';
import { addPanelBackground, addText, TEXT_COLORS, UI_DEPTH } from './theme';

export interface PlayerChipModel {
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

const BAR_HEIGHT = 56;
const CHIP_WIDTH = 150;
const CHIP_GAP = 8;

/** Barra superior: rodada, fase, cronômetro e vidas de todos os jogadores. */
export class TopBar {
  private readonly roundText: Phaser.GameObjects.Text;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly chipGraphics: Phaser.GameObjects.Graphics;
  private readonly chipTexts: Phaser.GameObjects.Text[] = [];
  private readonly chipHearts: Phaser.GameObjects.Text[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly width: number,
    playerCount: number,
  ) {
    addPanelBackground(scene, 0, 0, width, BAR_HEIGHT).setStrokeStyle(0);
    this.roundText = addText(scene, 20, 8, '', { fontSize: '20px', fontStyle: 'bold' }).setDepth(UI_DEPTH);
    this.phaseText = addText(scene, 20, 32, '', { fontSize: '13px', color: TEXT_COLORS.muted }).setDepth(UI_DEPTH);
    this.timerText = addText(scene, 590, 6, '', { fontSize: '34px', fontStyle: 'bold', color: TEXT_COLORS.gold }).setOrigin(0.5, 0).setDepth(UI_DEPTH);
    this.chipGraphics = scene.add.graphics().setDepth(UI_DEPTH);
    for (let index = 0; index < playerCount; index++) {
      const x = this.chipX(index, playerCount);
      this.chipTexts.push(addText(scene, x + 10, 8, '', { fontSize: '13px', fontStyle: 'bold' }).setDepth(UI_DEPTH + 1));
      this.chipHearts.push(addText(scene, x + 10, 28, '', { fontSize: '15px', color: '#ef4444' }).setDepth(UI_DEPTH + 1));
    }
  }

  render(model: TopBarModel): void {
    this.roundText.setText(model.roundLabel);
    this.phaseText.setText(model.phaseLabel);
    this.timerText.setText(model.timerLabel);
    this.chipGraphics.clear();
    model.players.forEach((player, index) => {
      const x = this.chipX(index, model.players.length);
      this.chipGraphics.fillStyle(player.isYou ? 0x1d4ed8 : 0x0f1a30, player.isEliminated ? 0.4 : 1);
      this.chipGraphics.fillRoundedRect(x, 6, CHIP_WIDTH, 44, 6);
      this.chipGraphics.lineStyle(2, player.isOpponent ? 0xf97316 : 0x3b4d73, 1);
      this.chipGraphics.strokeRoundedRect(x, 6, CHIP_WIDTH, 44, 6);
      const suffix = player.isOpponent ? '  ⚔' : '';
      this.chipTexts[index]?.setText(`${player.name}${suffix}`).setAlpha(player.isEliminated ? 0.5 : 1);
      const hearts = player.isEliminated ? 'Eliminado' : '♥'.repeat(player.lives) + '♡'.repeat(Math.max(0, player.maximumLives - player.lives));
      this.chipHearts[index]?.setText(hearts).setColor(player.isEliminated ? TEXT_COLORS.muted : '#ef4444');
    });
  }

  private chipX(index: number, count: number): number {
    const totalWidth = count * CHIP_WIDTH + (count - 1) * CHIP_GAP;
    return this.width - 16 - totalWidth + index * (CHIP_WIDTH + CHIP_GAP);
  }
}
