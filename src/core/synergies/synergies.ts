import { NO_BONUSES, type TeamBonuses } from '@combat/units/bonuses';
import type { SynergyDefinition, SynergyEffect } from '@data/schemas/synergy';

/** Mapa de sinergia vigente: id do personagem → id da sinergia. */
export type SynergyMapping = Readonly<Record<string, string>>;

export interface SynergyStatus {
  readonly synergy: SynergyDefinition;
  /** Unidades da sinergia no tabuleiro (cada unidade vale 1, qualquer que seja a estrela). */
  readonly count: number;
  /** Índice do nível ativo em `synergy.tiers`, ou -1 se nenhum. */
  readonly activeTierIndex: number;
  /** Quantas unidades faltam para o próximo nível; `null` se já está no último. */
  readonly nextThreshold: number | null;
}

/** Conta as unidades do tabuleiro por sinergia e determina o nível ativo de cada uma (GDD 4.3). A reserva não conta. */
export function summarizeSynergies(boardCharacterIds: readonly string[], mapping: SynergyMapping, synergies: readonly SynergyDefinition[]): SynergyStatus[] {
  return synergies.map((synergy) => {
    const count = boardCharacterIds.filter((characterId) => mapping[characterId] === synergy.id).length;
    // O nível mais alto substitui os anteriores; os níveis não se acumulam.
    let activeTierIndex = -1;
    synergy.tiers.forEach((tier, index) => {
      if (count >= tier.threshold) {
        activeTierIndex = index;
      }
    });
    const nextTier = synergy.tiers[activeTierIndex + 1];
    return { synergy, count, activeTierIndex, nextThreshold: nextTier ? nextTier.threshold : null };
  });
}

/** Efeitos ativos de uma sinergia (os do nível atual), ou lista vazia. */
export function activeEffectsOf(status: SynergyStatus): readonly SynergyEffect[] {
  return status.activeTierIndex < 0 ? [] : (status.synergy.tiers[status.activeTierIndex]?.effects ?? []);
}

/** Bônus que uma unidade recebe quando só esta sinergia está no nível indicado (usado para medir o peso de cada nível). */
export function bonusesOfSingleTier(synergy: SynergyDefinition, tierIndex: number): TeamBonuses {
  const status: SynergyStatus = { synergy, count: synergy.tiers[tierIndex]?.threshold ?? 0, activeTierIndex: tierIndex, nextThreshold: null };
  return computeBonusesForUnit([status], synergy.id);
}

const MAXIMUM_COOLDOWN_REDUCTION = 0.9;

/** Efeitos ativos das sinergias que valem para uma unidade daquela sinergia. */
export function synergyEffectsFor(statuses: readonly SynergyStatus[], unitSynergyId: string | undefined): SynergyEffect[] {
  return statuses
    .filter((status) => status.synergy.appliesTo === 'allTeam' || status.synergy.id === unitSynergyId)
    .flatMap((status) => activeEffectsOf(status));
}

export function computeBonusesForUnit(statuses: readonly SynergyStatus[], unitSynergyId: string | undefined): TeamBonuses {
  return combineBonusEffects(synergyEffectsFor(statuses, unitSynergyId));
}

/**
 * Soma efeitos de bônus (de sinergias e de torres): resistência, recarga e amplificação somam;
 * multiplicadores de atributo se multiplicam; regenerações viram uma só taxa por segundo.
 */
export function combineBonusEffects(effects: readonly SynergyEffect[]): TeamBonuses {
  let resistance = 0;
  let damageMultiplier = 1;
  let attackSpeedMultiplier = 1;
  let maxHealthMultiplier = 1;
  let cooldownReduction = 0;
  let positiveEffectAmplification = 0;
  let regenPerSecond = 0;
  let shortestRegenTickSeconds = Infinity;

  for (const effect of effects) {
    switch (effect.type) {
      case 'resistance_bonus':
        resistance += effect.value;
        break;
      case 'attribute_multiplier':
        if (effect.attribute === 'damage') {
          damageMultiplier *= effect.value;
        } else if (effect.attribute === 'health') {
          maxHealthMultiplier *= effect.value;
        } else {
          attackSpeedMultiplier *= effect.value;
        }
        break;
      case 'cooldown_reduction':
        cooldownReduction += effect.value;
        break;
      case 'positive_effect_amplification':
        positiveEffectAmplification += effect.value;
        break;
      case 'hp_regen':
        regenPerSecond += effect.value / effect.tickSeconds;
        shortestRegenTickSeconds = Math.min(shortestRegenTickSeconds, effect.tickSeconds);
        break;
    }
  }

  const hasRegeneration = Number.isFinite(shortestRegenTickSeconds);
  return {
    ...NO_BONUSES,
    resistance,
    damageMultiplier,
    attackSpeedMultiplier,
    maxHealthMultiplier,
    cooldownReduction: Math.min(cooldownReduction, MAXIMUM_COOLDOWN_REDUCTION),
    positiveEffectAmplification,
    regenFraction: hasRegeneration ? regenPerSecond * shortestRegenTickSeconds : 0,
    regenIntervalMs: hasRegeneration ? shortestRegenTickSeconds * 1000 : 0,
  };
}
