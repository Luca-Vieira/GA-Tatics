import { z } from 'zod';
import { MAXIMUM_PLAYERS, MINIMUM_PLAYERS } from '@core/game/Game';
import { NO_ROOM_MODIFIERS, roomModifiersSchema } from '@data/schemas/roomModifiers';

/**
 * Mensagens que o cliente envia ao servidor. O servidor nunca confia no que chega: tudo passa por este esquema
 * (campos desconhecidos, tipos errados e valores fora do limite são recusados) antes de tocar no jogo.
 */

export const MAXIMUM_PLAYER_NAME_LENGTH = 20;
export const MAXIMUM_ROOM_PASSWORD_LENGTH = 20;
/** Mensagens maiores que isto são recusadas pela conexão antes mesmo de serem lidas. */
export const MAXIMUM_MESSAGE_BYTES = 2048;

const playerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAXIMUM_PLAYER_NAME_LENGTH)
  .refine((name) => !/\p{Cc}/u.test(name), 'O nome não pode ter caracteres de controle.');

const roomPasswordSchema = z
  .string()
  .min(1)
  .max(MAXIMUM_ROOM_PASSWORD_LENGTH)
  .refine((password) => !/\p{Cc}/u.test(password), 'A senha não pode ter caracteres de controle.');

const roomVisibilitySchema = z.enum(['public', 'private']);

/** Tamanho de sala quando quem cria não escolhe (e o da partida rápida). */
export const DEFAULT_PLAYERS_PER_ROOM = 4;

const roomCodeSchema = z
  .string()
  .trim()
  .transform((code) => code.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{4}$/));

const boardCellSchema = z.strictObject({ q: z.number().int().min(-20).max(20), r: z.number().int().min(-20).max(20) });

const locationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('board'), cell: boardCellSchema }),
  z.strictObject({ kind: z.literal('bench'), slot: z.number().int().min(0).max(20) }),
]);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('create_room'),
    playerName: playerNameSchema,
    /** Pública aparece na lista de salas; privada só se entra com o código. */
    visibility: roomVisibilitySchema.default('public'),
    /** Senha opcional (vale para sala pública ou privada). */
    password: roomPasswordSchema.optional(),
    modifiers: roomModifiersSchema.default(NO_ROOM_MODIFIERS),
    /** Mapa escolhido por quem cria; sem ele, cada partida sorteia um dos liberados. */
    mapId: z.string().min(1).max(30).optional(),
    /** Total de jogadores da partida; as vagas sem pessoa viram bots. */
    maximumPlayers: z.number().int().min(MINIMUM_PLAYERS).max(MAXIMUM_PLAYERS).default(DEFAULT_PLAYERS_PER_ROOM),
  }),
  z.strictObject({ type: z.literal('join_room'), roomCode: roomCodeSchema, playerName: playerNameSchema, password: roomPasswordSchema.optional() }),
  z.strictObject({ type: z.literal('list_rooms') }),
  z.strictObject({ type: z.literal('quick_match'), playerName: playerNameSchema }),
  /** Assistir a uma partida em andamento, sem ocupar vaga. */
  z.strictObject({ type: z.literal('spectate_room'), roomCode: roomCodeSchema, password: roomPasswordSchema.optional() }),
  /** Só para quem assiste: passa a acompanhar outro jogador. */
  z.strictObject({ type: z.literal('watch_player'), playerId: z.string().min(1).max(40) }),
  z.strictObject({ type: z.literal('leave_room') }),
  z.strictObject({ type: z.literal('start_match') }),
  z.strictObject({ type: z.literal('buy'), shopSlot: z.number().int().min(0).max(9) }),
  z.strictObject({ type: z.literal('refresh_shop') }),
  z.strictObject({ type: z.literal('toggle_freeze'), shopSlot: z.number().int().min(0).max(9) }),
  z.strictObject({ type: z.literal('sell'), unitId: z.string().min(1).max(40) }),
  z.strictObject({ type: z.literal('move'), unitId: z.string().min(1).max(40), destination: locationSchema }),
  z.strictObject({ type: z.literal('set_ready'), ready: z.boolean() }),
]);

/** O que o cliente monta e envia (campos com valor padrão podem faltar). */
export type ClientMessage = z.input<typeof clientMessageSchema>;
/** O que o servidor entende depois de validar (os valores padrão já preenchidos). */
export type ParsedClientMessage = z.output<typeof clientMessageSchema>;

/** Mensagens que mexem no jogo em andamento (as demais cuidam da sala). */
export type GameActionMessage = Extract<ParsedClientMessage, { type: 'buy' | 'refresh_shop' | 'toggle_freeze' | 'sell' | 'move' | 'set_ready' }>;

export type ParseResult = { readonly ok: true; readonly message: ParsedClientMessage } | { readonly ok: false; readonly reason: string };

/** Lê o texto recebido da rede: JSON válido, tamanho limitado e formato conhecido. */
export function parseClientMessage(rawText: string): ParseResult {
  if (new TextEncoder().encode(rawText).length > MAXIMUM_MESSAGE_BYTES) {
    return { ok: false, reason: 'message_too_large' };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  const parsed = clientMessageSchema.safeParse(json);
  return parsed.success ? { ok: true, message: parsed.data } : { ok: false, reason: 'invalid_message' };
}

export function isGameAction(message: ParsedClientMessage): message is GameActionMessage {
  return ['buy', 'refresh_shop', 'toggle_freeze', 'sell', 'move', 'set_ready'].includes(message.type);
}
