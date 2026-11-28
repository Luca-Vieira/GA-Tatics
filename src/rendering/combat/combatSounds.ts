import type { CombatEvent, DamageCause } from '@combat/engine/events';
import type { StatusKind } from '@data/schemas/ability';
import type { SoundEffect } from '../audio';

/** Que som cada momento do combate faz (os golpes comuns, que têm balanço e impacto, ficam com quem os anima). */

const DAMAGE_SOUNDS: Readonly<Record<Exclude<DamageCause, 'attack'>, SoundEffect>> = {
  splash: 'splash_hit',
  ability: 'ability_hit',
  poison: 'poison',
  drain: 'poison',
};

const HELPFUL_STATUSES: readonly StatusKind[] = ['damage_reduction', 'speed_boost', 'damage_boost', 'resting'];

export function damageSoundOf(cause: Exclude<DamageCause, 'attack'>): SoundEffect {
  return DAMAGE_SOUNDS[cause];
}

/** Som de um evento que não precisa esperar a animação; `null` para os silenciosos. */
export function immediateSoundOf(event: CombatEvent): SoundEffect | null {
  switch (event.type) {
    case 'heal':
      return 'heal';
    case 'status':
      if (event.change !== 'applied') {
        return null;
      }
      return HELPFUL_STATUSES.includes(event.status) ? 'buff' : 'debuff';
    case 'spawn':
      return 'summon';
    case 'trap':
      return event.change === 'triggered' ? 'trap' : null;
    case 'terrain':
      return event.change === 'placed' ? 'terrain' : null;
    case 'ability':
      return 'ability';
    default:
      return null;
  }
}
