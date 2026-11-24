import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
/** Custo baixo de propósito: é uma senha de sala para jogar entre amigos, e cada tentativa errada gasta o limite da conexão. */
const SCRYPT_COST = 4096;

/**
 * Senha de uma sala. Guarda só o resumo (scrypt com sal próprio) e compara em tempo constante; o texto da senha
 * nunca fica na memória do servidor depois da criação da sala e nunca é enviado de volta a ninguém.
 */
export class RoomPassword {
  private constructor(
    private readonly salt: Buffer,
    private readonly hash: Buffer,
  ) {}

  static create(password: string): RoomPassword {
    const salt = randomBytes(16);
    return new RoomPassword(salt, scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST }));
  }

  matches(candidate: string): boolean {
    const candidateHash = scryptSync(candidate, this.salt, KEY_LENGTH, { N: SCRYPT_COST });
    return timingSafeEqual(candidateHash, this.hash);
  }
}
