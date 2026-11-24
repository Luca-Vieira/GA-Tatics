/**
 * Movimentos procedurais do sprite: funções puras do tempo, sem estado.
 * Aplicados só à apresentação; a posição lógica da unidade vem da simulação.
 */

export interface SpriteOffset {
  readonly offsetY: number;
  readonly rotation: number;
}

/** Idle: oscilação vertical suave com um leve balanço lateral (wiggle). `phase` desencontra as unidades. */
export function idleMotion(timeMs: number, phase: number): SpriteOffset {
  return {
    offsetY: Math.sin(timeMs / 320 + phase) * 2.5,
    rotation: Math.sin(timeMs / 450 + phase) * 0.05,
  };
}

/** Walk: quique vertical e inclinação alternada enquanto a unidade se desloca. */
export function walkMotion(timeMs: number, phase: number): SpriteOffset {
  return {
    offsetY: -Math.abs(Math.sin(timeMs / 95 + phase)) * 7,
    rotation: Math.sin(timeMs / 95 + phase) * 0.13,
  };
}
