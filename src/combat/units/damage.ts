/** Teto da redução total de dano (decisão em decisoes-de-design.md, Seção 4). */
export const MAXIMUM_DAMAGE_REDUCTION = 0.8;

/**
 * Dano recebido depois das reduções. As reduções se combinam de forma multiplicativa:
 * dano × (1 − resistência) × (1 − redução de habilidade), limitado ao teto.
 */
export function calculateDamageTaken(rawDamage: number, resistance: number, abilityReduction = 0): number {
  const combinedReduction = 1 - (1 - resistance) * (1 - abilityReduction);
  const appliedReduction = Math.min(Math.max(combinedReduction, 0), MAXIMUM_DAMAGE_REDUCTION);
  return rawDamage * (1 - appliedReduction);
}
