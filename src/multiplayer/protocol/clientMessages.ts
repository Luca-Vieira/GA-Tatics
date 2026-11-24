import { z } from 'zod';

/**
 * Mensagens que o cliente envia ao servidor. O servidor nunca confia no que chega: tudo passa por este esquema
 * (campos desconhecidos, tipos errados e valores fora do limite são recusados) antes de tocar no jogo.
 */

export const MAXIMUM_PLAYER_NAME_LENGTH = 20;
/** Mensagens maiores que isto são recusadas pela conexão antes mesmo de serem lidas. */
export const MAXIMUM_MESSAGE_BYTES = 2048;

const playerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAXIMUM_PLAYER_NAME_LENGTH)
  .refine((name) => !/\p{Cc}/u.test(name), 'O nome não pode ter caracteres de controle.');

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
  z.strictObject({ type: z.literal('create_room'), playerName: playerNameSchema }),
  z.strictObject({ type: z.literal('join_room'), roomCode: roomCodeSchema, playerName: playerNameSchema }),
  z.strictObject({ type: z.literal('leave_room') }),
  z.strictObject({ type: z.literal('start_match') }),
  z.strictObject({ type: z.literal('buy'), shopSlot: z.number().int().min(0).max(9) }),
  z.strictObject({ type: z.literal('refresh_shop') }),
  z.strictObject({ type: z.literal('toggle_freeze'), shopSlot: z.number().int().min(0).max(9) }),
  z.strictObject({ type: z.literal('sell'), unitId: z.string().min(1).max(40) }),
  z.strictObject({ type: z.literal('move'), unitId: z.string().min(1).max(40), destination: locationSchema }),
  z.strictObject({ type: z.literal('set_ready'), ready: z.boolean() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Mensagens que mexem no jogo em andamento (as demais cuidam da sala). */
export type GameActionMessage = Extract<ClientMessage, { type: 'buy' | 'refresh_shop' | 'toggle_freeze' | 'sell' | 'move' | 'set_ready' }>;

export type ParseResult = { readonly ok: true; readonly message: ClientMessage } | { readonly ok: false; readonly reason: string };

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

export function isGameAction(message: ClientMessage): message is GameActionMessage {
  return ['buy', 'refresh_shop', 'toggle_freeze', 'sell', 'move', 'set_ready'].includes(message.type);
}
