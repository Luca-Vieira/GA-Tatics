import type { SoundEffect } from './types';

/** Tempo mínimo entre duas execuções do mesmo efeito. Os de combate têm os maiores intervalos para não virar ruído. */
export const MINIMUM_INTERVAL_MS: Readonly<Record<SoundEffect, number>> = {
  attack: 120,
  ability: 180,
  purchase: 60,
  sell: 60,
  refresh: 120,
  tower_destroyed: 300,
  unit_death: 150,
  round_win: 1000,
  round_loss: 1000,
  click: 40,
};

export class EffectThrottle {
  private readonly lastPlayedAtMs = new Map<SoundEffect, number>();

  /** `true` se o efeito pode tocar agora; nesse caso, o intervalo dele recomeça a contar. */
  tryAcquire(effect: SoundEffect, nowMs: number): boolean {
    const lastMs = this.lastPlayedAtMs.get(effect);
    if (lastMs !== undefined && nowMs - lastMs < MINIMUM_INTERVAL_MS[effect]) {
      return false;
    }
    this.lastPlayedAtMs.set(effect, nowMs);
    return true;
  }
}
