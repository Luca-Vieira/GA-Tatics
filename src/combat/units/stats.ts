/** Atributos do GDD, na escala de 1 a 10. */
export interface BaseStats {
  readonly health: number;
  readonly damage: number;
  readonly attackSpeed: number;
  readonly range: number;
  readonly mobility: number;
}

/** Atributos em valores de jogo, usados pela simulação. */
export interface CombatStats {
  readonly maxHealth: number;
  readonly damage: number;
  readonly attacksPerSecond: number;
  readonly range: number;
  readonly hexesPerSecond: number;
}

export type StarLevel = 1 | 2 | 3;

/** Multiplicadores de vida e dano por estrela (valores iniciais do GDD, Seção 2.6). */
export type StarMultipliers = Readonly<Record<StarLevel, number>>;

export const STAR_MULTIPLIERS: StarMultipliers = { 1: 1, 2: 2.5, 3: 6 };

/** Vida de jogo por ponto de atributo. Calibrada para combates de 15–25 s, com poucos estouros do tempo limite (decisoes-de-design.md, Seção 13). */
export const HEALTH_PER_POINT = 150;

/** Converte a escala 1–10 em valores de jogo (fórmulas em decisoes-de-design.md, Seção 2). */
export function toCombatStats(base: BaseStats, starLevel: StarLevel = 1, starMultipliers: StarMultipliers = STAR_MULTIPLIERS): CombatStats {
  const starMultiplier = starMultipliers[starLevel];
  return {
    maxHealth: HEALTH_PER_POINT * base.health * starMultiplier,
    damage: 10 * base.damage * starMultiplier,
    attacksPerSecond: 0.4 + 0.15 * base.attackSpeed,
    range: base.range,
    hexesPerSecond: 0.8 + 0.3 * base.mobility,
  };
}
