import { describe, expect, it } from 'vitest';
import { bySize, isCompactViewport } from './displayProfile';

describe('modo compacto', () => {
  it('vale em celulares, deitados ou em pé', () => {
    for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 932, height: 430 }, { width: 390, height: 844 }]) {
      expect(isCompactViewport(viewport), `${viewport.width}x${viewport.height}`).toBe(true);
    }
  });

  it('não vale em computadores nem em tablets grandes', () => {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1536, height: 730 }, { width: 1920, height: 950 }, { width: 1024, height: 768 }]) {
      expect(isCompactViewport(viewport), `${viewport.width}x${viewport.height}`).toBe(false);
    }
  });

  it('fora do navegador usa o valor normal', () => {
    expect(bySize('normal', 'compacto')).toBe('normal');
  });
});
