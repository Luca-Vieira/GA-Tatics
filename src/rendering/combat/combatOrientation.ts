import type { AttackFacing } from '@shared/utils/attackArea';

/**
 * Para que lado da tela uma orientação do combate aponta. No tabuleiro deitado o lado B fica à esquerda, então olhar
 * para o lado A é olhar para a direita; quando a tela está girada (quem vê luta como lado A), inverte.
 */
export function isFacingScreenRight(facing: AttackFacing, isViewFlipped: boolean): boolean {
  return (facing === 'toA') !== isViewFlipped;
}
