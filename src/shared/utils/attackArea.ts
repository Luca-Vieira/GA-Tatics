/**
 * Geometria das áreas de ataque. Funções puras, usadas pelo combate, pela tela, pela galeria e pelo painel.
 *
 * O eixo de batalha são as linhas lógicas do tabuleiro. Um ataque "olha" para o lado A (linhas menores) ou para o lado B
 * (linhas maiores) e sempre se vira para o alvo. Todos os formatos são simétricos por rotação de 180°: se o alvo está na
 * área de quem ataca, quem ataca está na mesma área vista do alvo (com o mesmo formato e alcance).
 */
import { BOARD_CELLS, type BoardSide } from '../constants/board';
import { hexDistance, type Hex } from './hex';

export const ATTACK_SHAPES = ['circle', 'front_line', 'diagonals', 'semicircle', 'scythe', 'dashed', 'dashed_center'] as const;
export type AttackShape = (typeof ATTACK_SHAPES)[number];

/** Para onde o ataque está virado, no eixo de batalha. Na tela deitada isso vira esquerda ou direita. */
export type AttackFacing = 'toA' | 'toB';

/**
 * Para que lado um golpe curvo varre, no eixo lateral do tabuleiro: com o tabuleiro deitado na tela, `low` é para cima
 * e `high` é para baixo. Só a foice não é igual dos dois lados; os outros formatos ignoram este valor.
 */
export type AttackSweep = 'low' | 'high';

export const DEFAULT_ATTACK_SWEEP: AttackSweep = 'low';

/** Casa do alvo vista por quem ataca. */
interface LocalOffset {
  /** Linhas à frente (negativo = atrás; 0 = na mesma linha). */
  readonly forward: number;
  /**
   * Desvio lateral em meias casas (positivo = para o lado da varredura): as vizinhas da frente ficam em ±1 e as da
   * mesma linha em ±2.
   */
  readonly lateral: number;
  readonly distance: number;
}

/** Para criar um formato novo, basta acrescentá-lo aqui, em `ATTACK_SHAPES`, no rótulo e na descrição. */
const SHAPE_RULES: Readonly<Record<AttackShape, (offset: LocalOffset) => boolean>> = {
  circle: () => true,
  front_line: ({ forward, lateral }) => forward > 0 && Math.abs(lateral) <= 1,
  diagonals: ({ forward, lateral }) => forward > 0 && Math.abs(lateral) === forward,
  semicircle: ({ forward }) => forward >= 0,
  scythe: ({ forward, lateral }) => forward >= 0 && lateral >= -1,
  dashed: isDashedCell,
  dashed_center: (offset) => isDashedCell(offset) || (offset.forward > 0 && offset.distance === 2 && offset.lateral === 0),
};

/** Faixa à frente com vãos: só as distâncias ímpares. */
function isDashedCell({ forward, lateral, distance }: LocalOffset): boolean {
  return forward > 0 && Math.abs(lateral) <= 1 && distance % 2 === 1;
}

const SHAPE_LABELS: Readonly<Record<AttackShape, string>> = {
  circle: 'Círculo',
  front_line: 'Linha frontal',
  diagonals: 'Diagonais',
  semicircle: 'Semicírculo',
  scythe: 'Foice',
  dashed: 'Área tracejada',
  dashed_center: 'Tracejada com centro',
};

const SHAPE_DESCRIPTIONS: Readonly<Record<AttackShape, string>> = {
  circle: 'em todas as direções',
  front_line: 'numa faixa reta à frente',
  diagonals: 'só nas duas diagonais da frente',
  semicircle: 'na frente e nas casas ao lado',
  scythe: 'num golpe curvo pela frente e por um lado, para cima ou para baixo conforme o inimigo',
  dashed: 'numa faixa à frente com vãos (acerta só nas distâncias ímpares)',
  dashed_center: 'numa faixa à frente com vãos (distâncias ímpares), mais a casa do centro, a 2 casas em linha reta',
};

/** Quem é do lado A começa olhando para o lado B, e vice-versa. */
export function defaultFacingOf(side: BoardSide): AttackFacing {
  return side === 'A' ? 'toB' : 'toA';
}

/** Orientação que encara o alvo; na mesma linha não há frente nem trás, e vale `fallback`. */
export function facingTowards(origin: Hex, target: Hex, fallback: AttackFacing): AttackFacing {
  if (target.r === origin.r) {
    return fallback;
  }
  return target.r > origin.r ? 'toB' : 'toA';
}

/** Lado para onde o golpe curvo varre para alcançar o alvo; na altura de quem ataca vale `fallback`. */
export function sweepTowards(origin: Hex, target: Hex, fallback: AttackSweep = DEFAULT_ATTACK_SWEEP): AttackSweep {
  const lateral = lateralOffset(origin, target);
  if (lateral === 0) {
    return fallback;
  }
  return lateral > 0 ? 'high' : 'low';
}

function lateralOffset(origin: Hex, target: Hex): number {
  return 2 * (target.q - origin.q) + (target.r - origin.r);
}

export function isInAttackArea(origin: Hex, target: Hex, shape: AttackShape, range: number, facing: AttackFacing, sweep: AttackSweep = DEFAULT_ATTACK_SWEEP): boolean {
  const distance = hexDistance(origin, target);
  if (distance < 1 || distance > range) {
    return false;
  }
  const forward = (target.r - origin.r) * (facing === 'toB' ? 1 : -1);
  const lateral = lateralOffset(origin, target) * (sweep === 'high' ? 1 : -1);
  return SHAPE_RULES[shape]({ forward, lateral, distance });
}

/** Casas do tabuleiro cobertas pelo ataque a partir de `origin` (a própria casa não entra). */
export function attackAreaCells(origin: Hex, shape: AttackShape, range: number, facing: AttackFacing, sweep: AttackSweep = DEFAULT_ATTACK_SWEEP): Hex[] {
  return BOARD_CELLS.filter((cell) => isInAttackArea(origin, cell, shape, range, facing, sweep));
}

/** Verdadeiro se, virando-se (e varrendo) para o alvo, quem está em `origin` o alcança. É a regra do combate. */
export function canAttackFrom(origin: Hex, target: Hex, shape: AttackShape, range: number, side: BoardSide): boolean {
  return isInAttackArea(origin, target, shape, range, facingTowards(origin, target, defaultFacingOf(side)), sweepTowards(origin, target));
}

export function attackShapeLabel(shape: AttackShape): string {
  return SHAPE_LABELS[shape];
}

/** Texto em português para o painel de informações, a galeria e o painel de administração. */
export function describeAttackArea(shape: AttackShape, range: number, maxTargets = 1, splashDamageFraction = 1): string {
  const reach = `alcance ${range} ${range === 1 ? 'casa' : 'casas'}`;
  const base = `${SHAPE_LABELS[shape]}: ataca ${SHAPE_DESCRIPTIONS[shape]}, ${reach}.`;
  if (maxTargets <= 1) {
    return base;
  }
  return `${base} Acerta até ${maxTargets} inimigos; os extras recebem ${Math.round(splashDamageFraction * 100)}% do dano.`;
}
