import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './originPolicy';
import { RateLimiter } from './rateLimiter';
import { ManualScheduler } from './scheduler';

describe('política de origem', () => {
  it('aceita clientes sem origem (não são navegadores)', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('aceita páginas da própria máquina e de redes privadas', () => {
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173', 'http://192.168.1.20:5173', 'http://10.1.2.3', 'http://172.20.0.5:8080', 'http://app.localhost']) {
      expect(isOriginAllowed(origin), origin).toBe(true);
    }
  });

  it('recusa páginas da internet e origens malformadas', () => {
    for (const origin of ['https://evil.example.com', 'http://8.8.8.8', 'http://172.32.0.1', 'http://192.169.0.1', 'http://localhost.evil.com', 'null', 'não é url']) {
      expect(isOriginAllowed(origin), origin).toBe(false);
    }
  });
});

describe('limite de mensagens', () => {
  it('deixa passar a rajada, bloqueia o excesso e devolve fichas com o tempo', () => {
    const limiter = new RateLimiter(5, 2, 0);
    const allowedInBurst = Array.from({ length: 8 }, () => limiter.tryConsume(0)).filter(Boolean).length;
    expect(allowedInBurst).toBe(5);
    expect(limiter.tryConsume(400)).toBe(false);
    // 1 s depois da rajada, 2 fichas voltaram (2 por segundo).
    expect(limiter.tryConsume(1000)).toBe(true);
    expect(limiter.tryConsume(1000)).toBe(true);
    expect(limiter.tryConsume(1000)).toBe(false);
  });

  it('nunca acumula mais fichas que a rajada', () => {
    const limiter = new RateLimiter(3, 100, 0);
    const allowed = Array.from({ length: 10 }, () => limiter.tryConsume(60_000)).filter(Boolean).length;
    expect(allowed).toBe(3);
  });
});

describe('relógio manual', () => {
  it('executa as tarefas na ordem, inclusive as criadas durante o avanço, e respeita o cancelamento', () => {
    const scheduler = new ManualScheduler();
    const log: string[] = [];
    scheduler.after(200, () => log.push('B'));
    scheduler.after(100, () => {
      log.push('A');
      scheduler.after(50, () => log.push('A2'));
    });
    const cancel = scheduler.after(120, () => log.push('cancelada'));
    cancel();
    scheduler.advance(150);
    expect(log).toEqual(['A', 'A2']);
    scheduler.advance(100);
    expect(log).toEqual(['A', 'A2', 'B']);
    expect(scheduler.nowMs()).toBe(250);
    expect(scheduler.pendingCount).toBe(0);
  });
});
