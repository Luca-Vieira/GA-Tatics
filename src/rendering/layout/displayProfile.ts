import { LOGICAL_HEIGHT, LOGICAL_WIDTH, type ScreenSize } from '../display/renderScale';

/**
 * Abaixo desta quantidade de pixels CSS por unidade de tela (com o aparelho deitado), o jogo aparece pequeno demais para
 * a interface completa: a partida usa o modo compacto, com menos informação e letras maiores. É o caso dos celulares.
 */
const COMPACT_BELOW_PIXELS_PER_UNIT = 0.72;

export function isCompactViewport(viewport: ScreenSize): boolean {
  const longerSide = Math.max(viewport.width, viewport.height);
  const shorterSide = Math.min(viewport.width, viewport.height);
  return Math.min(longerSide / LOGICAL_WIDTH, shorterSide / LOGICAL_HEIGHT) < COMPACT_BELOW_PIXELS_PER_UNIT;
}

/** Vale para o que for montado agora: a cena da partida consulta ao criar cada parte da tela. */
export function isCompactDisplay(): boolean {
  return typeof window !== 'undefined' && isCompactViewport({ width: window.innerWidth, height: window.innerHeight });
}

/** O valor normal ou o do modo compacto. */
export function bySize<Value>(regular: Value, compact: Value): Value {
  return isCompactDisplay() ? compact : regular;
}
