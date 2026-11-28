/**
 * Desenho do fundo de um mapa e as cores das casas. Usa só o canvas 2D, para o jogo e a prévia do painel desenharem
 * exatamente a mesma coisa. As texturas são sorteadas com semente fixa: saem sempre iguais.
 */
import type { MapBackground, MapTexture, MapTiles } from '@data/schemas/map';
import { SeededRandom } from '../utils/random';
import type { Hex } from '../utils/hex';

export interface TilePalette {
  readonly top: number;
  /** Lateral da lajota (mais escura). */
  readonly side: number;
  readonly edge: number;
}

const SIDE_SHADE = -0.42;
const EDGE_SHADE = 0.36;

function channelsOf(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Clareia (quantidade positiva) ou escurece (negativa) uma cor, de -1 (preto) a 1 (branco). */
export function shadeColor(color: string, amount: number): number {
  const [red, green, blue] = channelsOf(color).map((channel) => {
    const target = amount >= 0 ? 255 : 0;
    return Math.round(channel + (target - channel) * Math.min(1, Math.abs(amount)));
  }) as [number, number, number];
  return (red << 16) | (green << 8) | blue;
}

export function cssColorOf(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** Cores de uma casa. Com variação, cada casa ganha um tom próprio, sempre o mesmo para a mesma casa. */
export function tilePaletteOf(tiles: MapTiles, half: 'left' | 'right', cell: Hex): TilePalette {
  const base = tiles[half];
  const shift = tiles.variation === 0 ? 0 : (new SeededRandom(`tile:${cell.q},${cell.r}`).next() * 2 - 1) * tiles.variation;
  const top = cssColorOf(shadeColor(base, shift));
  return { top: shadeColor(top, 0), side: shadeColor(top, SIDE_SHADE), edge: shadeColor(top, EDGE_SHADE) };
}

/** Cor que melhor representa o fundo, para preencher o que sobrar em volta. */
export function backgroundBaseColorOf(background: MapBackground): string {
  switch (background.type) {
    case 'color':
    case 'texture':
      return background.color;
    case 'gradient':
      return background.from;
    case 'image':
      return '#0b1220';
  }
}

/** Pinta o fundo inteiro. Nos fundos de imagem, sem a imagem carregada fica só a cor base. */
export function paintBackground(context: CanvasRenderingContext2D, background: MapBackground, width: number, height: number, image?: CanvasImageSource & { width: number; height: number }): void {
  context.fillStyle = backgroundBaseColorOf(background);
  context.fillRect(0, 0, width, height);
  switch (background.type) {
    case 'color':
      return;
    case 'gradient':
      paintGradient(context, background, width, height);
      return;
    case 'texture':
      TEXTURE_PAINTERS[background.texture](context, { width, height, detail: background.detail, base: background.color, random: new SeededRandom(`texture:${background.texture}`) });
      return;
    case 'image':
      if (image) {
        paintCovering(context, image, width, height);
        context.fillStyle = `rgba(0, 0, 0, ${background.darken})`;
        context.fillRect(0, 0, width, height);
      }
      return;
  }
}

function paintGradient(context: CanvasRenderingContext2D, background: Extract<MapBackground, { type: 'gradient' }>, width: number, height: number): void {
  const gradient =
    background.direction === 'radial'
      ? context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) / 2)
      : context.createLinearGradient(0, 0, background.direction === 'horizontal' ? width : 0, background.direction === 'vertical' ? height : 0);
  gradient.addColorStop(0, background.from);
  gradient.addColorStop(1, background.to);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

/** Cobre a área toda com a imagem, cortando o que sobrar, sem deformar. */
function paintCovering(context: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, width: number, height: number): void {
  const scale = Math.max(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  context.drawImage(image, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

interface TextureRequest {
  readonly width: number;
  readonly height: number;
  readonly base: string;
  readonly detail: string;
  readonly random: SeededRandom;
}

type TexturePainter = (context: CanvasRenderingContext2D, request: TextureRequest) => void;

function rgba(color: string, alpha: number): string {
  const [red, green, blue] = channelsOf(color);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function dot(context: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string): void {
  context.fillStyle = fill;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

/** Grãos espalhados, claros e escuros, em volta da cor base. */
function speckle(context: CanvasRenderingContext2D, { width, height, base, random }: TextureRequest, count: number, strength: number): void {
  for (let grain = 0; grain < count; grain++) {
    const shade = cssColorOf(shadeColor(base, (random.next() * 2 - 1) * strength));
    dot(context, random.next() * width, random.next() * height, 0.8 + random.next() * 1.8, shade);
  }
}

/** Linha ondulada de um lado a outro. */
function wave(context: CanvasRenderingContext2D, width: number, y: number, amplitude: number, length: number, phase: number): void {
  context.beginPath();
  for (let x = 0; x <= width; x += 8) {
    const point = y + Math.sin((x / length) * Math.PI * 2 + phase) * amplitude;
    if (x === 0) {
      context.moveTo(x, point);
    } else {
      context.lineTo(x, point);
    }
  }
  context.stroke();
}

/** Areia com dunas e uma faixa de mar no alto (na cor de detalhe). */
const paintSand: TexturePainter = (context, request) => {
  const { width, height, base, detail, random } = request;
  speckle(context, request, 2600, 0.28);
  context.lineWidth = 3;
  context.strokeStyle = cssColorOf(shadeColor(base, 0.12));
  for (let dune = 0; dune < 9; dune++) {
    wave(context, width, height * (0.3 + dune * 0.08), 5, 220 + random.next() * 120, random.next() * 6);
  }
  const seaHeight = height * 0.17;
  context.fillStyle = detail;
  context.fillRect(0, 0, width, seaHeight);
  for (let line = 0; line < 4; line++) {
    context.strokeStyle = rgba('#ffffff', 0.12 + line * 0.07);
    wave(context, width, seaHeight * (0.35 + line * 0.22), 3 + line, 130, line * 1.7);
  }
};

/** Rocha escura cortada por rachaduras incandescentes. */
const paintLava: TexturePainter = (context, request) => {
  const { width, height, detail, random } = request;
  speckle(context, request, 1600, 0.2);
  context.lineCap = 'round';
  for (let crack = 0; crack < 26; crack++) {
    let x = random.next() * width;
    let y = random.next() * height;
    const heading = random.next() * Math.PI * 2;
    const path: [number, number][] = [[x, y]];
    for (let segment = 0; segment < 6; segment++) {
      const angle = heading + (random.next() - 0.5) * 1.8;
      x += Math.cos(angle) * (14 + random.next() * 26);
      y += Math.sin(angle) * (14 + random.next() * 26);
      path.push([x, y]);
    }
    for (const [lineWidth, alpha] of [
      [9, 0.12],
      [4, 0.3],
      [1.5, 0.85],
    ] as const) {
      context.lineWidth = lineWidth;
      context.strokeStyle = rgba(detail, alpha);
      context.beginPath();
      path.forEach(([px, py], index) => (index === 0 ? context.moveTo(px, py) : context.lineTo(px, py)));
      context.stroke();
    }
  }
};

/** Gramado com tufos. */
const paintGrass: TexturePainter = (context, request) => {
  const { width, height, base, detail, random } = request;
  speckle(context, request, 1400, 0.18);
  context.lineWidth = 1.6;
  context.lineCap = 'round';
  for (let tuft = 0; tuft < 520; tuft++) {
    const x = random.next() * width;
    const y = random.next() * height;
    context.strokeStyle = random.chance(0.5) ? rgba(detail, 0.75) : cssColorOf(shadeColor(base, 0.2));
    context.beginPath();
    for (const lean of [-4, 0, 4]) {
      context.moveTo(x, y);
      context.lineTo(x + lean, y - 6 - random.next() * 6);
    }
    context.stroke();
  }
};

/** Céu estrelado com o chão da Lua, cheio de crateras, embaixo. */
const paintMoon: TexturePainter = (context, { width, height, detail, random }) => {
  for (let star = 0; star < 340; star++) {
    dot(context, random.next() * width, random.next() * height * 0.75, random.next() * 1.4 + 0.3, rgba('#ffffff', 0.25 + random.next() * 0.7));
  }
  const ground = cssColorOf(shadeColor(detail, -0.62));
  context.fillStyle = ground;
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(0, height * 0.74);
  context.quadraticCurveTo(width / 2, height * 0.6, width, height * 0.74);
  context.lineTo(width, height);
  context.fill();
  for (let crater = 0; crater < 36; crater++) {
    const x = random.next() * width;
    const y = height * 0.74 + random.next() * height * 0.25;
    const radius = 5 + random.next() * 26;
    context.fillStyle = cssColorOf(shadeColor(detail, -0.72));
    context.beginPath();
    context.ellipse(x, y, radius, radius * 0.38, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = rgba(detail, 0.35);
    context.lineWidth = 1.5;
    context.stroke();
  }
};

/** Água: faixas de ondas. */
const paintWaves: TexturePainter = (context, { width, height, detail, random }) => {
  context.lineWidth = 2;
  for (let y = 12; y < height; y += 26) {
    context.strokeStyle = rgba(detail, 0.25 + random.next() * 0.35);
    wave(context, width, y, 4 + random.next() * 3, 90 + random.next() * 90, random.next() * 6);
  }
};

/** Pontilhado regular, para um fundo discreto. */
const paintDots: TexturePainter = (context, { width, height, detail }) => {
  const spacing = 28;
  for (let row = 0; row * spacing <= height; row++) {
    for (let column = 0; column * spacing <= width; column++) {
      dot(context, column * spacing + (row % 2) * (spacing / 2), row * spacing, 2, rgba(detail, 0.45));
    }
  }
};

const TEXTURE_PAINTERS: Readonly<Record<MapTexture, TexturePainter>> = {
  sand: paintSand,
  lava: paintLava,
  grass: paintGrass,
  moon: paintMoon,
  waves: paintWaves,
  dots: paintDots,
};
