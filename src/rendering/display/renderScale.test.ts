import { describe, expect, it } from 'vitest';
import { canvasSizeFor, computeRenderScale, MAXIMUM_RENDER_SCALE, MINIMUM_RENDER_SCALE } from './renderScale';

describe('computeRenderScale', () => {
  it('desenha um pixel por pixel da área ocupada na janela, e não da tela inteira', () => {
    const windowedBrowser = computeRenderScale({ width: 1536, height: 730 }, 1);
    expect(canvasSizeFor(windowedBrowser)).toEqual({ width: 1298, height: 730 });
    expect(computeRenderScale({ width: 1920, height: 1080 }, 1)).toBe(1.5);
  });

  it('conta a densidade da tela: no celular deitado o canvas tem os pixels reais', () => {
    expect(canvasSizeFor(computeRenderScale({ width: 844, height: 390 }, 3))).toEqual({ width: 2080, height: 1170 });
  });

  it('respeita os limites e trata densidade desconhecida como 1', () => {
    expect(computeRenderScale({ width: 3840, height: 2160 }, 2)).toBe(MAXIMUM_RENDER_SCALE);
    expect(computeRenderScale({ width: 200, height: 100 }, 1)).toBe(MINIMUM_RENDER_SCALE);
    expect(computeRenderScale({ width: 1280, height: 720 }, 0)).toBe(1);
  });

  it('o canvas sempre tem tamanho inteiro', () => {
    for (const width of [667, 844, 1298, 1366, 1536, 2048]) {
      const size = canvasSizeFor(computeRenderScale({ width, height: width * 0.5 }, 1.25));
      expect(Number.isInteger(size.width) && Number.isInteger(size.height)).toBe(true);
    }
  });
});
