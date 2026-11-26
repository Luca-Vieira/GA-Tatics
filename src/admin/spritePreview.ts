/** Prévia ao vivo de um sprite sobre uma casa do tabuleiro, em pixels do jogo (ampliada na página). */
import { HEX_SIZE } from '@shared/utils/boardProjection';
import { svgEl } from './dom';
import { flatTopHexPoints } from './hexDrawing';
import { GAME_BODY_HEIGHT, GAME_BODY_WIDTH, mirrorBox, placeSprite, type ImageSize, type SpriteAdjustment, type SpriteFacing } from './spriteAdjust';

const VIEW_WIDTH = 220;
const VIEW_HEIGHT = 200;
/** Ponto do desenho onde ficam os pés da unidade (centro da casa). */
const FEET_X = VIEW_WIDTH / 2;
const FEET_Y = VIEW_HEIGHT * 0.72;
const SHADOW_RADIUS_X = 23;
const SHADOW_RADIUS_Y = 8;

export interface SpritePreviewFrame {
  /** Endereço da imagem; `null` mostra só a referência. */
  readonly url: string | null;
  readonly adjustment: SpriteAdjustment;
  readonly bodyScale: number;
  readonly facing: SpriteFacing;
  /** Mostra o contorno da cápsula provisória, para comparar posição e tamanho. */
  readonly showReference: boolean;
}

export interface SpritePreviewDragHandlers {
  readonly start: () => void;
  /** Deslocamento desde o começo do arrasto, em pixels do jogo. */
  readonly move: (deltaX: number, deltaY: number) => void;
  readonly end: () => void;
}

export interface SpritePreview {
  readonly element: SVGSVGElement;
  update(frame: SpritePreviewFrame): void;
}

export function createSpritePreview(drag: SpritePreviewDragHandlers, onImageError: () => void): SpritePreview {
  const shadow = svgEl('ellipse', { cx: FEET_X, cy: FEET_Y, fill: '#000000', 'fill-opacity': 0.35 });
  const reference = svgEl('rect', { fill: 'none', stroke: '#94a3b8', 'stroke-width': 1, 'stroke-dasharray': '4 3' });
  const image = svgEl('image', { preserveAspectRatio: 'none' });
  const element = svgEl('svg', { viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`, class: 'sprite-stage', role: 'img', 'aria-label': 'Prévia do sprite sobre uma casa do tabuleiro' }, [
    svgEl('polygon', { points: flatTopHexPoints({ x: FEET_X, y: FEET_Y }, HEX_SIZE), fill: '#1e3a5f', stroke: '#60a5fa', 'stroke-width': 1.5 }),
    shadow,
    reference,
    image,
    svgEl('line', { x1: FEET_X - 6, y1: FEET_Y, x2: FEET_X + 6, y2: FEET_Y, stroke: '#facc15', 'stroke-width': 1 }),
    svgEl('line', { x1: FEET_X, y1: FEET_Y - 6, x2: FEET_X, y2: FEET_Y + 6, stroke: '#facc15', 'stroke-width': 1 }),
  ]);

  const imageSizes = new Map<string, ImageSize>();
  let lastFrame: SpritePreviewFrame | null = null;

  function loadImageSize(url: string): void {
    const loader = new Image();
    loader.addEventListener('load', () => {
      imageSizes.set(url, { width: loader.naturalWidth, height: loader.naturalHeight });
      if (lastFrame?.url === url) paint(lastFrame);
    });
    loader.addEventListener('error', onImageError);
    loader.src = url;
  }

  function paintReference(frame: SpritePreviewFrame): void {
    const width = GAME_BODY_WIDTH * frame.bodyScale;
    const height = GAME_BODY_HEIGHT * frame.bodyScale;
    shadow.setAttribute('rx', String(SHADOW_RADIUS_X * frame.bodyScale));
    shadow.setAttribute('ry', String(SHADOW_RADIUS_Y * frame.bodyScale));
    reference.setAttribute('x', String(FEET_X - width / 2));
    reference.setAttribute('y', String(FEET_Y - height));
    reference.setAttribute('width', String(width));
    reference.setAttribute('height', String(height));
    reference.setAttribute('rx', String(width / 2));
    reference.setAttribute('visibility', frame.showReference || !frame.url ? 'visible' : 'hidden');
  }

  function paintImage(frame: SpritePreviewFrame): void {
    const size = frame.url ? imageSizes.get(frame.url) : undefined;
    if (!frame.url || !size) {
      image.setAttribute('visibility', 'hidden');
      return;
    }
    const facingRight = placeSprite(frame.adjustment, size, frame.bodyScale);
    const box = frame.facing === 'right' ? facingRight : mirrorBox(facingRight);
    const boxCenterX = FEET_X + box.left + box.width / 2;
    image.setAttribute('href', frame.url);
    image.setAttribute('x', String(FEET_X + box.left));
    image.setAttribute('y', String(FEET_Y + box.top));
    image.setAttribute('width', String(box.width));
    image.setAttribute('height', String(box.height));
    // Espelha a imagem no próprio retângulo, que já está na posição espelhada.
    image.setAttribute('transform', frame.facing === 'right' ? '' : `translate(${2 * boxCenterX} 0) scale(-1 1)`);
    image.setAttribute('visibility', 'visible');
  }

  function paint(frame: SpritePreviewFrame): void {
    paintReference(frame);
    paintImage(frame);
  }

  attachDrag(element, drag);

  return {
    element,
    update(frame) {
      lastFrame = frame;
      if (frame.url && !imageSizes.has(frame.url)) loadImageSize(frame.url);
      paint(frame);
    },
  };
}

/** Arrastar com mouse ou dedo; o deslocamento é convertido de pixels da página para pixels do jogo. */
function attachDrag(element: SVGSVGElement, drag: SpritePreviewDragHandlers): void {
  let origin: { x: number; y: number; pointerId: number } | null = null;
  const finish = () => {
    if (!origin) return;
    origin = null;
    drag.end();
  };
  element.addEventListener('pointerdown', (event) => {
    origin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    element.setPointerCapture(event.pointerId);
    drag.start();
  });
  element.addEventListener('pointermove', (event) => {
    if (!origin || origin.pointerId !== event.pointerId) return;
    const gamePixelsPerPagePixel = VIEW_WIDTH / element.getBoundingClientRect().width;
    drag.move((event.clientX - origin.x) * gamePixelsPerPagePixel, (event.clientY - origin.y) * gamePixelsPerPagePixel);
  });
  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', finish);
}
