/**
 * Bônus de equipe (vindos das sinergias) já resolvidos em números. O combate não conhece sinergias:
 * quem monta o combate calcula estes valores e os entrega junto com cada unidade.
 */
export interface TeamBonuses {
  /** Redução percentual de dano recebido (0 a 1), somada à resistência base da unidade. */
  readonly resistance: number;
  /** Multiplicadores estáticos aplicados aos atributos antes do primeiro passo. */
  readonly damageMultiplier: number;
  readonly attackSpeedMultiplier: number;
  readonly maxHealthMultiplier: number;
  /** Fração por que o tempo de recarga das habilidades diminui (0,15 = 15% mais rápido). */
  readonly cooldownReduction: number;
  /** Fração extra aplicada aos efeitos positivos das habilidades (cura, escudos e bônus). */
  readonly positiveEffectAmplification: number;
  /** Regeneração periódica: fração da vida máxima recuperada a cada intervalo. Zero desliga. */
  readonly regenFraction: number;
  readonly regenIntervalMs: number;
}

export const NO_BONUSES: TeamBonuses = {
  resistance: 0,
  damageMultiplier: 1,
  attackSpeedMultiplier: 1,
  maxHealthMultiplier: 1,
  cooldownReduction: 0,
  positiveEffectAmplification: 0,
  regenFraction: 0,
  regenIntervalMs: 0,
};
