import type { SoundEffect } from './types';

/** Tempo mínimo entre duas execuções do mesmo efeito. Os de combate seguram a repetição para não virar ruído. */
export const MINIMUM_INTERVAL_MS: Readonly<Record<SoundEffect, number>> = {
  attack: 120,
  hit: 80,
  shot: 110,
  ranged_hit: 90,
  splash_hit: 110,
  ability_hit: 120,
  miss: 220,
  heal: 240,
  poison: 260,
  buff: 280,
  debuff: 280,
  summon: 160,
  trap: 200,
  terrain: 260,
  ability: 180,
  unit_death: 150,
  tower_destroyed: 300,
  combat_start: 600,
  countdown: 500,
  purchase: 60,
  sell: 60,
  refresh: 120,
  fusion: 250,
  error: 150,
  round_win: 1000,
  round_loss: 1000,
  match_win: 1500,
  match_loss: 1500,
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
