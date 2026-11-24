import { describe, expect, it } from 'vitest';
import { AdminAuth, validateAdminCredentials } from './adminAuth';

const CREDENTIALS = { username: 'chefe', password: 'senha-bem-grande' };

function makeAuth(overrides: { nowMs?: () => number; sessionSeconds?: number } = {}) {
  let now = 1_000_000;
  const auth = new AdminAuth(CREDENTIALS, { nowMs: overrides.nowMs ?? (() => now), sessionSeconds: overrides.sessionSeconds, lockSeconds: 60, maximumFailuresPerWindow: 3 });
  return { auth, advance: (ms: number) => (now += ms) };
}

describe('credenciais do administrador', () => {
  it('só liga com usuário e senha de tamanho razoável', () => {
    expect(validateAdminCredentials(null)).toContain('ADMIN_USERNAME');
    expect(validateAdminCredentials({ username: '', password: 'senha-bem-grande' })).toContain('ADMIN_USERNAME');
    expect(validateAdminCredentials({ username: 'a', password: 'curta' })).toContain('ao menos 8');
    expect(validateAdminCredentials(CREDENTIALS)).toBeNull();
  });
});

describe('login do administrador', () => {
  it('entrega um token aleatório com usuário e senha certos', () => {
    const { auth } = makeAuth();
    const first = auth.login('chefe', 'senha-bem-grande', 'a');
    const second = auth.login('chefe', 'senha-bem-grande', 'a');
    expect(first.ok && first.token).toMatch(/^[0-9a-f]{64}$/);
    expect(first.ok && second.ok && first.token !== second.token).toBe(true);
    expect(first.ok && auth.isValid(first.token)).toBe(true);
  });

  it('recusa usuário ou senha errados, sem dizer qual deles', () => {
    const { auth } = makeAuth();
    expect(auth.login('chefe', 'errada', 'a')).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(auth.login('outro', 'senha-bem-grande', 'a')).toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(auth.login('', '', 'a')).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('trava quem erra demais, mesmo que depois acerte, e libera depois do tempo', () => {
    const { auth, advance } = makeAuth();
    for (let attempt = 0; attempt < 3; attempt++) {
      auth.login('chefe', 'errada', 'invasor');
    }
    expect(auth.login('chefe', 'senha-bem-grande', 'invasor')).toEqual({ ok: false, reason: 'locked' });
    // Outro endereço não é afetado.
    expect(auth.login('chefe', 'senha-bem-grande', 'dono').ok).toBe(true);
    advance(61_000);
    expect(auth.login('chefe', 'senha-bem-grande', 'invasor').ok).toBe(true);
  });

  it('o acerto zera as falhas do endereço', () => {
    const { auth } = makeAuth();
    auth.login('chefe', 'errada', 'a');
    auth.login('chefe', 'errada', 'a');
    expect(auth.login('chefe', 'senha-bem-grande', 'a').ok).toBe(true);
    auth.login('chefe', 'errada', 'a');
    auth.login('chefe', 'errada', 'a');
    expect(auth.login('chefe', 'senha-bem-grande', 'a').ok).toBe(true);
  });

  it('a sessão expira e pode ser encerrada; token inventado não vale', () => {
    const { auth, advance } = makeAuth({ sessionSeconds: 100 });
    const login = auth.login('chefe', 'senha-bem-grande', 'a');
    if (!login.ok) throw new Error('login deveria funcionar');
    expect(auth.isValid(login.token)).toBe(true);
    expect(auth.isValid('inventado')).toBe(false);
    expect(auth.isValid(undefined)).toBe(false);
    advance(101_000);
    expect(auth.isValid(login.token)).toBe(false);

    const second = auth.login('chefe', 'senha-bem-grande', 'a');
    if (!second.ok) throw new Error('login deveria funcionar');
    auth.logout(second.token);
    expect(auth.isValid(second.token)).toBe(false);
  });

  it('guarda no máximo 20 sessões, descartando as mais antigas', () => {
    const { auth } = makeAuth();
    const tokens = Array.from({ length: 21 }, () => {
      const login = auth.login('chefe', 'senha-bem-grande', 'a');
      if (!login.ok) throw new Error('login deveria funcionar');
      return login.token;
    });
    expect(auth.isValid(tokens[0])).toBe(false);
    expect(auth.isValid(tokens[20])).toBe(true);
  });
});
