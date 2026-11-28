/**
 * Conta do encaixe de um sprite sobre os pés da unidade, a mesma que o jogo aplica (`rendering/sprites/UnitView.ts`):
 * a altura da imagem é ajustada à da cápsula provisória e multiplicada pela escala; o ponto de âncora da imagem fica
 * nos pés, deslocado por (offsetX, offsetY). Tudo ainda é multiplicado pela escala do tipo de corpo.
 */
import type { SpriteDefinition } from '@data/schemas/character';

/** Tamanho do boneco provisório do jogo (`UNIT_BODY_TEXTURE_WIDTH/HEIGHT` em `rendering/sprites/unitTexture.ts`). */
export const GAME_BODY_WIDTH = 48;
export const GAME_BODY_HEIGHT = 64;
/** Escalas do corpo que o jogo usa para cada tipo de unidade (`CombatPlayback.ts` e `PreparationView.ts`). */
export const MELEE_BODY_SCALE = 1;
export const RANGED_BODY_SCALE = 0.85;
export const SUMMON_BODY_SCALE = 0.6;

export type SpriteAdjustment = Omit<SpriteDefinition, 'path'>;

export const DEFAULT_SPRITE_ADJUSTMENT: SpriteAdjustment = { scale: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 1 };

/** Os ajustes que são números, cada um com um controle deslizante (o espelhamento é um botão à parte). */
export type NumericAdjustment = Exclude<keyof SpriteAdjustment, 'mirrored'>;

export interface AdjustmentRange {
  readonly property: NumericAdjustment;
  readonly label: string;
  readonly help: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
}

export const ADJUSTMENT_RANGES: readonly AdjustmentRange[] = [
  { property: 'offsetX', label: 'Posição horizontal', help: 'Pixels do jogo; positivo vai para a frente do personagem.', minimum: -100, maximum: 100, step: 1 },
  { property: 'offsetY', label: 'Posição vertical', help: 'Pixels do jogo; positivo desce.', minimum: -100, maximum: 100, step: 1 },
  { property: 'scale', label: 'Escala', help: '1 = a altura da cápsula provisória.', minimum: 0.1, maximum: 5, step: 0.05 },
  { property: 'anchorX', label: 'Alinhamento horizontal (âncora X)', help: 'Ponto da imagem que fica sobre os pés: 0 = borda de trás, 1 = borda da frente.', minimum: 0, maximum: 1, step: 0.01 },
  { property: 'anchorY', label: 'Alinhamento vertical (âncora Y)', help: '0 = topo da imagem, 1 = base.', minimum: 0, maximum: 1, step: 0.01 },
];

export type SpriteFacing = 'right' | 'left';

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** Retângulo da imagem em pixels do jogo, com a origem nos pés da unidade (y cresce para baixo). */
export interface SpriteBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Onde a imagem aparece com o personagem olhando para a direita (o lado para o qual a arte é desenhada). */
export function placeSprite(adjustment: SpriteAdjustment, image: ImageSize, bodyScale: number): SpriteBox {
  const fit = (GAME_BODY_HEIGHT / image.height) * adjustment.scale;
  const width = image.width * fit * bodyScale;
  const height = image.height * fit * bodyScale;
  return {
    left: adjustment.offsetX * bodyScale - adjustment.anchorX * width,
    top: adjustment.offsetY * bodyScale - adjustment.anchorY * height,
    width,
    height,
  };
}

/** Virar para a esquerda é espelhar tudo em torno dos pés. */
export function mirrorBox(box: SpriteBox): SpriteBox {
  return { ...box, left: -(box.left + box.width) };
}

export type AlignmentPreset = 'feet' | 'center_horizontal' | 'center_cell';

export const ALIGNMENT_PRESET_LABELS: Readonly<Record<AlignmentPreset, string>> = {
  feet: 'Pés no chão',
  center_horizontal: 'Centralizar na horizontal',
  center_cell: 'Centralizar na casa',
};

export function applyAlignment(adjustment: SpriteAdjustment, preset: AlignmentPreset): SpriteAdjustment {
  switch (preset) {
    case 'feet':
      return { ...adjustment, anchorY: 1, offsetY: 0 };
    case 'center_horizontal':
      return { ...adjustment, anchorX: 0.5, offsetX: 0 };
    case 'center_cell':
      return { ...adjustment, anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0 };
  }
}

/** Arrasta a imagem na prévia: o deslocamento na tela (pixels do jogo) vira mudança de posição. */
export function dragAdjustment(start: SpriteAdjustment, deltaX: number, deltaY: number, bodyScale: number, facing: SpriteFacing): SpriteAdjustment {
  const forwardDelta = facing === 'right' ? deltaX : -deltaX;
  return clampAdjustment({
    ...start,
    offsetX: Math.round(start.offsetX + forwardDelta / bodyScale),
    offsetY: Math.round(start.offsetY + deltaY / bodyScale),
  });
}

const DECIMAL_PRECISION = 100;
const MAXIMUM_OFFSET = 500;

function clamp(value: number, minimum: number, maximum: number): number {
  const rounded = Math.round(value * DECIMAL_PRECISION) / DECIMAL_PRECISION;
  return Math.min(Math.max(rounded, minimum), maximum);
}

/** Mantém os valores no que o jogo aceita (os deslocamentos digitados podem passar do que o controle deslizante mostra). */
export function clampAdjustment(adjustment: SpriteAdjustment): SpriteAdjustment {
  return {
    scale: clamp(adjustment.scale, 0.1, 5),
    offsetX: clamp(adjustment.offsetX, -MAXIMUM_OFFSET, MAXIMUM_OFFSET),
    offsetY: clamp(adjustment.offsetY, -MAXIMUM_OFFSET, MAXIMUM_OFFSET),
    anchorX: clamp(adjustment.anchorX, 0, 1),
    anchorY: clamp(adjustment.anchorY, 0, 1),
    // Só aparece quando ligado: um sprite sem espelhamento continua com os mesmos campos de antes.
    ...(adjustment.mirrored ? { mirrored: true } : {}),
  };
}

export function adjustmentOf(sprite: SpriteDefinition | undefined): SpriteAdjustment {
  if (!sprite) {
    return DEFAULT_SPRITE_ADJUSTMENT;
  }
  const { path: _path, ...adjustment } = sprite;
  void _path;
  return adjustment;
}

export function isSameAdjustment(first: SpriteAdjustment, second: SpriteAdjustment): boolean {
  return (first.mirrored === true) === (second.mirrored === true) && ADJUSTMENT_RANGES.every(({ property }) => first[property] === second[property]);
}

const MAXIMUM_HISTORY_SIZE = 100;

/**
 * Ajuste em andamento de um sprite: o que está aplicado ao conteúdo, o que está na prévia e o histórico para desfazer.
 * Um gesto (arrastar um controle) mostra vários valores intermediários e conta como um passo só do histórico.
 */
export class SpriteAdjustmentSession {
  private appliedValue: SpriteAdjustment;
  private currentValue: SpriteAdjustment;
  private lastRecorded: SpriteAdjustment;
  private history: SpriteAdjustment[] = [];

  constructor(applied: SpriteAdjustment) {
    this.appliedValue = applied;
    this.currentValue = applied;
    this.lastRecorded = applied;
  }

  get current(): SpriteAdjustment {
    return this.currentValue;
  }

  get applied(): SpriteAdjustment {
    return this.appliedValue;
  }

  get isDirty(): boolean {
    return !isSameAdjustment(this.currentValue, this.appliedValue);
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Mostra um valor na prévia, sem criar um passo no histórico. */
  preview(next: SpriteAdjustment): void {
    this.currentValue = clampAdjustment(next);
  }

  /** Fecha o gesto: o valor da prévia vira um passo que dá para desfazer. */
  record(): void {
    if (isSameAdjustment(this.currentValue, this.lastRecorded)) {
      return;
    }
    this.history = [...this.history, this.lastRecorded].slice(-MAXIMUM_HISTORY_SIZE);
    this.lastRecorded = this.currentValue;
  }

  change(next: SpriteAdjustment): void {
    this.preview(next);
    this.record();
  }

  undo(): void {
    const previous = this.history.pop();
    if (!previous) {
      return;
    }
    this.currentValue = previous;
    this.lastRecorded = previous;
  }

  restoreDefault(): void {
    this.change(DEFAULT_SPRITE_ADJUSTMENT);
  }

  discard(): void {
    this.change(this.appliedValue);
  }

  markApplied(): void {
    this.appliedValue = this.currentValue;
  }
}
