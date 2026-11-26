import { describe, expect, it } from 'vitest';
import { EffectThrottle, MINIMUM_INTERVAL_MS } from './effectThrottle';

describe('limite de repetição dos efeitos', () => {
  it('segura o mesmo efeito até o intervalo passar', () => {
    const throttle = new EffectThrottle();

    expect(throttle.tryAcquire('attack', 0)).toBe(true);
    expect(throttle.tryAcquire('attack', MINIMUM_INTERVAL_MS.attack - 1)).toBe(false);
    expect(throttle.tryAcquire('attack', MINIMUM_INTERVAL_MS.attack)).toBe(true);
  });

  it('uma tentativa recusada não adia a próxima', () => {
    const throttle = new EffectThrottle();
    throttle.tryAcquire('attack', 0);
    throttle.tryAcquire('attack', MINIMUM_INTERVAL_MS.attack - 1);

    expect(throttle.tryAcquire('attack', MINIMUM_INTERVAL_MS.attack + 1)).toBe(true);
  });

  it('um efeito não bloqueia outro', () => {
    const throttle = new EffectThrottle();
    throttle.tryAcquire('attack', 0);

    expect(throttle.tryAcquire('unit_death', 0)).toBe(true);
  });

  it('muitos ataques em um segundo viram no máximo nove sons', () => {
    const throttle = new EffectThrottle();
    const attemptTimes = Array.from({ length: 200 }, (_, index) => index * 5);

    const playedCount = attemptTimes.filter((timeMs) => throttle.tryAcquire('attack', timeMs)).length;

    expect(playedCount).toBeLessThanOrEqual(9);
  });
});
