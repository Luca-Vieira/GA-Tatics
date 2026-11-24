import type { SynergyEffect } from '@data/schemas/synergy';

/** Tempo restante em texto curto: "1d 03h", "03h 12m" ou "12m 05s". */
export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const twoDigits = (value: number) => String(value).padStart(2, '0');
  if (days > 0) {
    return `${days}d ${twoDigits(hours)}h`;
  }
  if (hours > 0) {
    return `${twoDigits(hours)}h ${twoDigits(minutes)}m`;
  }
  return `${twoDigits(minutes)}m ${twoDigits(seconds)}s`;
}

function percent(fraction: number): string {
  const value = Math.round(fraction * 1000) / 10;
  return `${String(value).replace('.', ',')}%`;
}

/** Texto curto, em português, de um efeito de sinergia (para o painel de sinergias e as dicas). */
export function describeSynergyEffect(effect: SynergyEffect): string {
  switch (effect.type) {
    case 'resistance_bonus':
      return `+${percent(effect.value)} de resistência`;
    case 'hp_regen':
      return `regenera ${percent(effect.value)} da vida a cada ${effect.tickSeconds} s`;
    case 'cooldown_reduction':
      return `habilidades ${percent(effect.value)} mais rápidas`;
    case 'positive_effect_amplification':
      return `efeitos positivos ${percent(effect.value)} mais fortes`;
    case 'attribute_multiplier':
      return `+${percent(effect.value - 1)} de ${effect.attribute === 'damage' ? 'dano' : 'velocidade de ataque'}`;
  }
}
