/** Peças de DOM da galeria. Todo texto entra por `textContent`: o conteúdo vem do servidor. */
import type { SpriteDefinition } from '@data/schemas/character';
import { ATTRIBUTE_SCALE_MAXIMUM, type GalleryAttribute, type GalleryAttack } from './galleryModel';
import { buildAttackGrid } from './attackGrid';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** O corpo provisório do jogo é uma cápsula de 48×64 com a inicial; a cor é a da metade da tela de quem está vendo. */
const PLACEHOLDER_BODY_COLOR = '#f97316';
const NEUTRAL_RING_COLOR = '#fbbf24';

export type SpriteUrlResolver = (path: string) => string;

export function createElement(tagName: string, className = '', text = ''): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== '') {
    element.textContent = text;
  }
  return element;
}

export function createContainer(className: string, ...children: Node[]): HTMLElement {
  const container = createElement('div', className);
  container.append(...children);
  return container;
}

export function createButton(text: string, onClick: () => void, className = ''): HTMLButtonElement {
  const button = createElement('button', className, text) as HTMLButtonElement;
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export function createSelect(label: string, options: readonly SelectOption[], chosenValue: string, onChange: (value: string) => void): HTMLSelectElement {
  const select = createElement('select') as HTMLSelectElement;
  select.setAttribute('aria-label', label);
  for (const { value, label: optionLabel } of options) {
    const option = createElement('option', '', optionLabel) as HTMLOptionElement;
    option.value = value;
    select.append(option);
  }
  select.value = chosenValue;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function createSvgElement(tagName: string, attributes: Readonly<Record<string, string>>): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function createPlaceholderDrawing(name: string, ringColor: string): SVGElement {
  const drawing = createSvgElement('svg', { viewBox: '0 0 64 80', role: 'img', 'aria-label': name });
  const ring = createSvgElement('ellipse', { cx: '32', cy: '70', rx: '27', ry: '8', fill: 'rgba(0,0,0,0.35)', stroke: ringColor, 'stroke-width': '3' });
  const body = createSvgElement('rect', { x: '10', y: '8', width: '44', height: '60', rx: '22', fill: PLACEHOLDER_BODY_COLOR, stroke: 'rgba(0,0,0,0.5)', 'stroke-width': '3' });
  const initial = createSvgElement('text', { x: '32', y: '46', 'text-anchor': 'middle', fill: '#ffffff', 'font-size': '24', 'font-weight': 'bold' });
  initial.textContent = name.charAt(0);
  drawing.append(ring, body, initial);
  return drawing;
}

export interface PortraitOptions {
  readonly name: string;
  readonly sprite: SpriteDefinition | null;
  readonly ringColor: string | null;
  readonly spriteUrlOf: SpriteUrlResolver;
  readonly isSmall?: boolean;
}

/** A imagem enviada pelo painel ou, sem ela (ou se não carregar), o desenho provisório do jogo. */
export function createPortrait(options: PortraitOptions): HTMLElement {
  const portrait = createElement('div', options.isSmall ? 'galeria-retrato galeria-retrato-pequeno' : 'galeria-retrato');
  const placeholder = () => createPlaceholderDrawing(options.name, options.ringColor ?? NEUTRAL_RING_COLOR);
  if (!options.sprite) {
    portrait.append(placeholder());
    return portrait;
  }
  const image = createElement('img') as HTMLImageElement;
  image.alt = options.name;
  image.addEventListener('error', () => portrait.replaceChildren(placeholder()));
  image.src = options.spriteUrlOf(options.sprite.path);
  portrait.append(image);
  return portrait;
}

export function createAttributeBars(attributes: readonly GalleryAttribute[], strongerKeys: ReadonlySet<string> = new Set()): HTMLElement {
  const rows = attributes.map((attribute) => {
    const fill = createElement('div', 'galeria-preenchimento');
    fill.style.width = `${(attribute.scaleValue / ATTRIBUTE_SCALE_MAXIMUM) * 100}%`;
    return createContainer(
      strongerKeys.has(attribute.key) ? 'galeria-atributo galeria-maior' : 'galeria-atributo',
      createElement('span', '', `${attribute.label} ${attribute.scaleValue}/${ATTRIBUTE_SCALE_MAXIMUM}`),
      createElement('span', 'galeria-valor', attribute.displayValue),
      createContainer('galeria-trilho', fill),
    );
  });
  return createContainer('galeria-barras', ...rows);
}

const GRID_CELL_CLASSES = { origin: 'galeria-casa-origem', area: 'galeria-casa-area', empty: 'galeria-casa-vazia' } as const;

export function createAttackMap(name: string, attack: GalleryAttack): SVGElement {
  const grid = buildAttackGrid(attack.shape, attack.range);
  const map = createSvgElement('svg', {
    viewBox: `0 0 ${grid.width.toFixed(1)} ${grid.height.toFixed(1)}`,
    class: 'galeria-mapa',
    role: 'img',
    'aria-label': `Área de ataque de ${name}, olhando para a direita. ${attack.description}`,
  });
  for (const cell of grid.cells) {
    map.append(createSvgElement('polygon', { points: cell.points, class: GRID_CELL_CLASSES[cell.kind] }));
    if (cell.kind === 'origin') {
      const arrow = createSvgElement('text', { x: cell.center.x.toFixed(1), y: (cell.center.y + 5).toFixed(1), 'text-anchor': 'middle' });
      arrow.textContent = '▶';
      map.append(arrow);
    }
  }
  return map;
}
