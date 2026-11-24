import { randomInt } from 'node:crypto';

/** Sem I nem O, que se confundem com 1 e 0 quando alguém dita o código em voz alta. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export function generateRoomCode(): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}
