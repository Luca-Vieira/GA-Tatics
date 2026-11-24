import { passiveModifiers } from '../abilities/registeredBehaviors';
import type { CombatUnit } from '../units/unit';
import { findStatus } from './status';

/** Efeito combinado dos estados temporários e dos passivos sobre uma unidade, calculado a cada consulta. */
export interface UnitModifiers {
  readonly damageMultiplier: number;
  readonly attackSpeedMultiplier: number;
  readonly moveSpeedMultiplier: number;
  /** Redução de dano vinda de habilidades (0 a 1); combinada com a resistência na hora do dano. */
  readonly damageReduction: number;
  /** Falso quando a unidade está dormindo ou descansando: não ataca, não se move nem usa habilidades. */
  readonly canAct: boolean;
}

export function computeModifiers(unit: CombatUnit): UnitModifiers {
  const passive = passiveModifiers(unit);
  const slow = findStatus(unit, 'slow')?.value ?? 0;
  const speedBoost = findStatus(unit, 'speed_boost')?.value ?? 0;
  const damageBoost = findStatus(unit, 'damage_boost')?.value ?? 0;
  const weaken = findStatus(unit, 'weaken')?.value ?? 0;
  const speedMultiplier = (1 + speedBoost) * (1 - slow);

  return {
    damageMultiplier: passive.damageMultiplier * (1 + damageBoost) * (1 - weaken),
    attackSpeedMultiplier: passive.attackSpeedMultiplier * speedMultiplier,
    moveSpeedMultiplier: speedMultiplier,
    damageReduction: findStatus(unit, 'damage_reduction')?.value ?? 0,
    canAct: !findStatus(unit, 'sleep') && !findStatus(unit, 'resting'),
  };
}

export function computeOutgoingDamageMultiplier(unit: CombatUnit): number {
  return computeModifiers(unit).damageMultiplier;
}
