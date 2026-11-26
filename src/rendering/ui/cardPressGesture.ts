import type Phaser from 'phaser';

/** Segurar por este tempo mostra os detalhes em vez de comprar. */
export const HOLD_TO_INSPECT_MS = 380;

export interface CardPressHandlers {
  readonly onTap: () => void;
  readonly onHold: () => void;
  /** Só para mouse: no toque não existe "passar por cima". */
  readonly onHover: (isHovering: boolean) => void;
}

/**
 * Toque ou clique numa carta: soltar logo compra; segurar mostra os detalhes. Assim a loja funciona no celular sem
 * depender de passar o mouse por cima.
 */
export class CardPressGesture {
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private isPressing = false;

  constructor(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.GameObject,
    private readonly handlers: CardPressHandlers,
  ) {
    target.on('pointerdown', () => this.begin());
    target.on('pointerup', () => this.release());
    target.on('pointerover', (pointer: Phaser.Input.Pointer) => !pointer.wasTouch && handlers.onHover(true));
    target.on('pointerout', (pointer: Phaser.Input.Pointer) => {
      this.cancel();
      if (!pointer.wasTouch) {
        handlers.onHover(false);
      }
    });
    scene.events.once('shutdown', () => this.cancel());
  }

  cancel(): void {
    this.isPressing = false;
    this.clearTimer();
  }

  destroy(): void {
    this.cancel();
  }

  private begin(): void {
    this.cancel();
    this.isPressing = true;
    // Relógio do navegador, e não o da cena, que acelera junto com a velocidade do combate.
    this.holdTimer = setTimeout(() => {
      this.isPressing = false;
      this.handlers.onHold();
    }, HOLD_TO_INSPECT_MS);
  }

  private release(): void {
    const isTap = this.isPressing;
    this.cancel();
    if (isTap) {
      this.handlers.onTap();
    }
  }

  private clearTimer(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
}
