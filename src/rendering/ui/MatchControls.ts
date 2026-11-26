import Phaser from 'phaser';
import { bySize, isCompactDisplay } from '../layout/displayProfile';
import { BENCH_ROW, BOARD_CENTER, LEAVE_BUTTON, MAIN_BUTTON, SHOP_AREA, TOAST_Y } from '../layout/gameLayout';
import { Button } from './Button';
import { addText, COLORS, setTextColor, TEXT_COLORS, UI_DEPTH } from './theme';

export interface MatchControlsCallbacks {
  readonly onReady: () => void;
  readonly onLeave: () => void;
}

export interface MatchControlsState {
  /** `other`: resultado da rodada, espera da próxima ou descanso. */
  readonly stage: 'preparation' | 'combat' | 'other' | 'ended';
  readonly isSpectator: boolean;
  readonly canBeReady: boolean;
  readonly isReady: boolean;
  readonly speed: number;
  readonly boardCount: number;
  readonly unitLimit: number;
  readonly watchedName: string;
}

const SIDE_TEXT_X = 14;
const SIDE_TEXT_WIDTH = 166;

/** Botões da partida (pronto, sair), a dica de velocidade e os avisos curtos em volta do tabuleiro. */
export class MatchControls {
  private readonly readyButton: Button;
  private readonly speedText: Phaser.GameObjects.Text;
  private readonly leaveButton: Button;
  private readonly sideText: Phaser.GameObjects.Text;
  private readonly spectatorText: Phaser.GameObjects.Text;
  private readonly toastText: Phaser.GameObjects.Text;
  private readonly sellHintText: Phaser.GameObjects.Text;
  private toastTween: Phaser.Tweens.Tween | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    callbacks: MatchControlsCallbacks,
  ) {
    this.readyButton = new Button(scene, { ...MAIN_BUTTON, label: 'Pronto', onClick: callbacks.onReady, color: COLORS.go, hoverColor: COLORS.goHover, fontSize: bySize(26, 38) });
    this.speedText = addText(scene, MAIN_BUTTON.x + MAIN_BUTTON.width / 2, MAIN_BUTTON.y + MAIN_BUTTON.height / 2, '', { fontSize: '14px', color: TEXT_COLORS.muted })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH);
    this.leaveButton = new Button(scene, { ...LEAVE_BUTTON, label: 'Sair', onClick: callbacks.onLeave, color: 0x7f1d1d, hoverColor: COLORS.danger, fontSize: bySize(17, 27) });
    this.sideText = addText(scene, SIDE_TEXT_X, BENCH_ROW.y + 8, '', { fontSize: bySize('14px', '22px'), fontStyle: 'bold', wordWrap: { width: SIDE_TEXT_WIDTH }, lineSpacing: 3 }).setDepth(UI_DEPTH);
    this.spectatorText = addText(scene, BOARD_CENTER.x, BENCH_ROW.y + BENCH_ROW.height / 2, '', {
      fontSize: bySize('18px', '25px'),
      fontStyle: 'bold',
      color: TEXT_COLORS.gold,
      align: 'center',
      lineSpacing: 6,
      padding: { y: 3 },
    })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH);
    this.toastText = addText(scene, BOARD_CENTER.x, TOAST_Y, '', { fontSize: bySize('19px', '29px'), fontStyle: 'bold', stroke: '#000000', strokeThickness: 5, align: 'center', wordWrap: { width: 900 } })
      .setOrigin(0.5, 0)
      .setDepth(UI_DEPTH + 5)
      .setAlpha(0);
    this.sellHintText = addText(scene, SHOP_AREA.x + SHOP_AREA.width / 2, SHOP_AREA.y + SHOP_AREA.height / 2, 'Solte aqui para vender', {
      fontSize: bySize('24px', '34px'),
      fontStyle: 'bold',
      color: TEXT_COLORS.bad,
      stroke: '#000000',
      strokeThickness: 5,
    })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH + 6)
      .setVisible(false);
    scene.events.once('shutdown', () => this.clearToastTimer());
  }

  render(state: MatchControlsState): void {
    const isPlaying = !state.isSpectator;
    this.readyButton.setVisible(isPlaying && state.stage !== 'combat' && state.stage !== 'ended');
    this.readyButton.setEnabled(state.stage === 'preparation' && state.canBeReady);
    this.readyButton.setLabel(state.isReady && state.stage === 'preparation' ? 'Aguardando…' : 'Pronto');
    this.speedText.setVisible(state.stage === 'combat' && !isCompactDisplay());
    this.speedText.setText(`Velocidade ${state.speed}x  ·  [S] muda`);
    this.leaveButton.setVisible(state.stage !== 'ended');
    this.renderSideText(state);
    this.spectatorText.setVisible(state.isSpectator && state.stage !== 'ended');
    this.spectatorText.setText(state.isSpectator ? `👁 Modo espectador · assistindo ${state.watchedName}\nToque num jogador no placar para trocar` : '');
  }

  showSellHint(isVisible: boolean): void {
    this.sellHintText.setVisible(isVisible);
  }

  toast(message: string, color: string, durationMs: number): void {
    this.hideToast();
    this.toastText.setText(message).setAlpha(1);
    setTextColor(this.toastText, color);
    // Relógio do navegador: o da cena acelera junto com a velocidade do combate.
    this.toastTimer = setTimeout(() => {
      this.toastTween = this.scene.tweens.add({ targets: this.toastText, alpha: 0, duration: 400 });
    }, durationMs);
  }

  hideToast(): void {
    this.clearToastTimer();
    this.toastTween?.stop();
    this.toastText.setAlpha(0);
  }

  private clearToastTimer(): void {
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  private renderSideText(state: MatchControlsState): void {
    const isFull = state.boardCount >= state.unitLimit;
    if (state.isSpectator || state.stage === 'ended') {
      this.sideText.setText('');
      return;
    }
    if (state.stage === 'combat') {
      this.sideText.setText(bySize('Toque num personagem para ver os detalhes', 'Toque para\nver detalhes'));
      setTextColor(this.sideText, TEXT_COLORS.muted);
      return;
    }
    const boardLabel = bySize('No tabuleiro: ', 'Campo ');
    this.sideText.setText(`${boardLabel}${state.boardCount}/${state.unitLimit}\nReserva  ➜`);
    setTextColor(this.sideText, isFull ? TEXT_COLORS.gold : TEXT_COLORS.main);
  }
}
