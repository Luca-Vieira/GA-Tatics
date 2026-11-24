import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AdminCredentials {
  readonly username: string;
  readonly password: string;
}

export type LoginResult =
  | { readonly ok: true; readonly token: string; readonly expiresInSeconds: number }
  | { readonly ok: false; readonly reason: 'invalid_credentials' | 'locked' };

export interface AdminAuthOptions {
  readonly nowMs?: () => number;
  readonly sessionSeconds?: number;
  readonly maximumFailuresPerWindow?: number;
  readonly lockSeconds?: number;
}

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_SESSIONS = 20;
const DEFAULT_SESSION_SECONDS = 8 * 60 * 60;
const DEFAULT_MAXIMUM_FAILURES = 5;
const DEFAULT_LOCK_SECONDS = 60;
/** Falhas somadas de todos os endereços; impede quem troca de endereço para tentar senhas sem parar. */
const GLOBAL_FAILURE_MULTIPLIER = 6;

/** O servidor só liga o painel de administração com uma senha de tamanho razoável. */
export function validateAdminCredentials(credentials: AdminCredentials | null): string | null {
  if (!credentials || credentials.username.length === 0) {
    return 'Defina ADMIN_USERNAME e ADMIN_PASSWORD para ligar o painel de administração.';
  }
  if (credentials.password.length < MINIMUM_PASSWORD_LENGTH) {
    return `A senha do administrador precisa ter ao menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

function digestOf(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Login único do administrador (sem cadastro: o usuário e a senha vêm da configuração do servidor, nunca do código).
 * Compara em tempo constante, trava depois de várias falhas e entrega um token aleatório que expira.
 * A senha nunca é guardada nem registrada; só o resumo (hash) dela fica na memória.
 */
export class AdminAuth {
  private readonly usernameDigest: Buffer;
  private readonly passwordDigest: Buffer;
  private readonly nowMs: () => number;
  private readonly sessionMs: number;
  private readonly maximumFailures: number;
  private readonly lockMs: number;
  private readonly sessions = new Map<string, number>();
  private readonly failuresByClient = new Map<string, number[]>();
  private readonly allFailures: number[] = [];

  constructor(credentials: AdminCredentials, options: AdminAuthOptions = {}) {
    this.usernameDigest = digestOf(credentials.username);
    this.passwordDigest = digestOf(credentials.password);
    this.nowMs = options.nowMs ?? Date.now;
    this.sessionMs = (options.sessionSeconds ?? DEFAULT_SESSION_SECONDS) * 1000;
    this.maximumFailures = options.maximumFailuresPerWindow ?? DEFAULT_MAXIMUM_FAILURES;
    this.lockMs = (options.lockSeconds ?? DEFAULT_LOCK_SECONDS) * 1000;
  }

  /** `clientKey` identifica quem tenta entrar (o endereço de rede); cada um tem o seu limite de tentativas. */
  login(username: string, password: string, clientKey: string): LoginResult {
    const now = this.nowMs();
    if (this.isLocked(clientKey, now)) {
      return { ok: false, reason: 'locked' };
    }
    // Os dois campos são sempre comparados, para o tempo de resposta não revelar qual deles errou.
    const isUsernameRight = timingSafeEqual(digestOf(username), this.usernameDigest);
    const isPasswordRight = timingSafeEqual(digestOf(password), this.passwordDigest);
    if (!(isUsernameRight && isPasswordRight)) {
      this.recordFailure(clientKey, now);
      return { ok: false, reason: 'invalid_credentials' };
    }
    this.failuresByClient.delete(clientKey);
    return { ok: true, token: this.createSession(now), expiresInSeconds: Math.round(this.sessionMs / 1000) };
  }

  isValid(token: string | undefined): boolean {
    if (!token) {
      return false;
    }
    const expiresAt = this.sessions.get(token);
    if (expiresAt === undefined) {
      return false;
    }
    if (expiresAt <= this.nowMs()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  logout(token: string | undefined): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  // --- Apoio --------------------------------------------------------------------------------------

  private createSession(now: number): string {
    this.purgeExpiredSessions(now);
    while (this.sessions.size >= MAXIMUM_SESSIONS) {
      // Remove a mais antiga: quem entrou primeiro perde a sessão.
      const oldestToken = this.sessions.keys().next().value as string;
      this.sessions.delete(oldestToken);
    }
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, now + this.sessionMs);
    return token;
  }

  private purgeExpiredSessions(now: number): void {
    for (const [token, expiresAt] of this.sessions) {
      if (expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }

  private recordFailure(clientKey: string, now: number): void {
    const recent = this.recentFailures(this.failuresByClient.get(clientKey) ?? [], now);
    recent.push(now);
    this.failuresByClient.set(clientKey, recent);
    this.allFailures.push(now);
  }

  private isLocked(clientKey: string, now: number): boolean {
    const clientFailures = this.recentFailures(this.failuresByClient.get(clientKey) ?? [], now);
    const totalFailures = this.recentFailures(this.allFailures, now);
    this.allFailures.splice(0, this.allFailures.length, ...totalFailures);
    return clientFailures.length >= this.maximumFailures || totalFailures.length >= this.maximumFailures * GLOBAL_FAILURE_MULTIPLIER;
  }

  private recentFailures(failures: readonly number[], now: number): number[] {
    return failures.filter((failedAt) => now - failedAt < this.lockMs);
  }
}
