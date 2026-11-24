/** Passo fixo da simulação: o combate avança sempre em fatias de 50 ms, independentemente da taxa de quadros. */
export const COMBAT_STEP_MS = 50;

/** Tempo máximo de um combate (GDD: 20 a 30 segundos). */
export const DEFAULT_COMBAT_TIME_LIMIT_MS = 30_000;

/** Atraso inicial antes de a primeira habilidade poder ser usada, para o combate não começar já com efeitos. */
export const INITIAL_ABILITY_DELAY_MS = 1500;
