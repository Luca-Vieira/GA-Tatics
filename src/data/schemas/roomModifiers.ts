import { z } from 'zod';

/**
 * Regras especiais que quem cria a sala escolhe (todas valem para os jogadores da sala, bots incluídos).
 * Cada campo tem um teto para a partida não perder o sentido; o padrão é zero (regras normais).
 */
export const roomModifiersSchema = z.strictObject({
  /** Vidas a mais para cada jogador. */
  extraLives: z.number().int().min(0).max(3).default(0),
  /** Segundos a mais em cada preparação (o tempo de montar a equipe). */
  extraPreparationSeconds: z.number().int().min(0).max(30).default(0),
  /** Segundos a mais no limite de cada combate (o "turno" de luta). */
  extraCombatSeconds: z.number().int().min(0).max(30).default(0),
  /** Moedas a mais por rodada. */
  extraIncome: z.number().int().min(0).max(5).default(0),
  /** Bônus de vida e dano de todas as unidades, em porcentagem ("mais status"). */
  statBonusPercent: z.number().int().min(0).max(50).default(0),
});

export type RoomModifiers = z.infer<typeof roomModifiersSchema>;

export const NO_ROOM_MODIFIERS: RoomModifiers = roomModifiersSchema.parse({});

/** As opções que o saguão oferece (valores permitidos de cada modificador). */
export const ROOM_MODIFIER_CHOICES = {
  extraLives: [0, 1, 2, 3],
  extraPreparationSeconds: [0, 10, 20, 30],
  extraCombatSeconds: [0, 10, 20, 30],
  extraIncome: [0, 1, 2, 3, 5],
  statBonusPercent: [0, 10, 25, 50],
} as const satisfies Record<keyof RoomModifiers, readonly number[]>;
