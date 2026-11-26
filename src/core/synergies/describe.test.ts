import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNERGIES } from '@data/defaults/synergies';
import { describeSynergyEffect, formatCountdown } from './describe';

describe('contagem regressiva', () => {
  it('mostra dias e horas, depois horas e minutos, depois minutos e segundos', () => {
    expect(formatCountdown(((1 * 24 + 3) * 3600 + 5) * 1000)).toBe('1d 03h');
    expect(formatCountdown((3 * 3600 + 12 * 60 + 9) * 1000)).toBe('03h 12m');
    expect(formatCountdown((12 * 60 + 5) * 1000)).toBe('12m 05s');
    expect(formatCountdown(-50)).toBe('00m 00s');
  });
});

describe('descrição dos efeitos de sinergia', () => {
  it('escreve cada efeito do nível 1 em português', () => {
    const texts = DEFAULT_SYNERGIES.flatMap((synergy) => synergy.tiers[0]!.effects.map(describeSynergyEffect));
    expect(texts).toEqual([
      '+4% de resistência',
      'regenera 1% da vida a cada 3 s',
      'habilidades 15% mais rápidas',
      'efeitos positivos 15% mais fortes',
      '+5% de dano',
      '+3% de velocidade de ataque',
    ]);
  });
});
