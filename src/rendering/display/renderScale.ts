/**
 * Resolução de desenho. As cenas trabalham sempre em 1280x720 ("unidades de tela"); o canvas é criado com exatamente os
 * pixels que o jogo ocupa na janela, e a câmera aproxima na mesma proporção. Um canvas maior ou menor que isso faz o
 * navegador reamostrar a imagem, e letras e linhas finas ficam borradas.
 */

export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 720;
export const MINIMUM_RENDER_SCALE = 0.5;
/** 3 já dá 3840x2160; acima disso o custo cresce mais que a nitidez. */
export const MAXIMUM_RENDER_SCALE = 3;

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/** Quantos pixels reais cabem em cada unidade de tela quando o jogo se ajusta, sem deformar, à área dada (em pixels CSS). */
export function computeRenderScale(viewport: ScreenSize, devicePixelRatio: number): number {
  const fit = Math.min(viewport.width / LOGICAL_WIDTH, viewport.height / LOGICAL_HEIGHT);
  const wantedScale = fit * (devicePixelRatio > 0 ? devicePixelRatio : 1);
  return Math.min(Math.max(wantedScale, MINIMUM_RENDER_SCALE), MAXIMUM_RENDER_SCALE);
}

/** Tamanho do canvas, em pixels inteiros, para uma escala de desenho. */
export function canvasSizeFor(scale: number): ScreenSize {
  return { width: Math.round(LOGICAL_WIDTH * scale), height: Math.round(LOGICAL_HEIGHT * scale) };
}

function scaleForWindow(): number {
  // Fora do navegador (nos testes) vale 1.
  return typeof window === 'undefined' ? 1 : computeRenderScale({ width: window.innerWidth, height: window.innerHeight }, window.devicePixelRatio);
}

let activeScale = scaleForWindow();

/** Escala em uso agora. */
export function renderScale(): number {
  return activeScale;
}

/** Recalcula a escala para o tamanho atual da janela. Devolve verdadeiro se ela mudou. */
export function updateRenderScaleFromWindow(): boolean {
  const nextScale = scaleForWindow();
  if (nextScale === activeScale) {
    return false;
  }
  activeScale = nextScale;
  return true;
}
