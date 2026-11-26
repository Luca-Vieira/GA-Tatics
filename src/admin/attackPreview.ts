/** Desenho da área de ataque de um personagem em edição, com a descrição em português. */
import { attackSchema, DEFAULT_ATTACK, type AttackDefinition } from '@data/schemas/attack';
import { describeAttackArea, isInAttackArea } from '@shared/utils/attackArea';
import { hexDistance, type Hex } from '@shared/utils/hex';
import { el, svgEl } from './dom';
import { flatTopCellCenter, flatTopHexPoints } from './hexDrawing';

const HEX_SIZE = 12;
/** Alcances maiores que isto não cabem no desenho (a descrição continua certa). */
const MAXIMUM_DRAWN_RANGE = 6;
const ORIGIN: Hex = { q: 0, r: 0 };

/** Casas em volta da origem, sem depender das bordas do tabuleiro. */
export function cellsAround(radius: number): Hex[] {
  const cells: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (hexDistance(ORIGIN, { q, r }) <= radius) cells.push({ q, r });
    }
  }
  return cells;
}

function drawArea(attack: AttackDefinition, range: number): SVGSVGElement {
  const drawnRange = Math.min(range, MAXIMUM_DRAWN_RANGE);
  const cells = cellsAround(drawnRange);
  const centers = cells.map((cell) => flatTopCellCenter(cell, HEX_SIZE));
  const halfWidth = Math.max(...centers.map((center) => Math.abs(center.x))) + HEX_SIZE + 2;
  const halfHeight = Math.max(...centers.map((center) => Math.abs(center.y))) + HEX_SIZE + 2;
  const polygons = cells.map((cell, position) => {
    const isOrigin = hexDistance(ORIGIN, cell) === 0;
    // Olhando para a direita da tela = para o lado A do tabuleiro.
    const isCovered = isInAttackArea(ORIGIN, cell, attack.shape, drawnRange, 'toA');
    const fill = isOrigin ? '#facc15' : isCovered ? '#ef4444' : '#1f2d4a';
    return svgEl('polygon', { points: flatTopHexPoints(centers[position] ?? { x: 0, y: 0 }, HEX_SIZE - 0.5), fill, stroke: '#3b4d73', 'stroke-width': 1 });
  });
  return svgEl(
    'svg',
    { viewBox: `${-halfWidth} ${-halfHeight} ${2 * halfWidth} ${2 * halfHeight}`, width: Math.round(2 * halfWidth), class: 'attack-drawing', role: 'img', 'aria-label': 'Área de ataque olhando para a direita' },
    polygons,
  );
}

export interface AttackPreview {
  readonly element: HTMLElement;
  /** Redesenha a partir do rascunho; um valor inválido mantém o desenho anterior. */
  update(draft: Record<string, unknown>): void;
}

function rangeOf(draft: Record<string, unknown>): number | null {
  const range = (draft.stats as { range?: unknown } | undefined)?.range;
  return typeof range === 'number' && Number.isInteger(range) && range >= 1 && range <= 10 ? range : null;
}

export function createAttackPreview(): AttackPreview {
  const drawing = el('div');
  const description = el('div', { className: 'muted' });
  const footnote = el('div', { className: 'help', text: 'Em amarelo, o personagem olhando para a direita; em vermelho, as casas que ele alcança. Virado para a esquerda, a área é espelhada.' });
  const element = el('div', { className: 'attack-preview' }, [drawing, description, footnote]);
  return {
    element,
    update(draft) {
      const parsed = attackSchema.safeParse(draft.attack ?? DEFAULT_ATTACK);
      const range = rangeOf(draft);
      if (!parsed.success || range === null) return;
      drawing.replaceChildren(drawArea(parsed.data, range));
      description.textContent = describeAttackArea(parsed.data.shape, range, parsed.data.maxTargets, parsed.data.splashDamageFraction);
    },
  };
}
