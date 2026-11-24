import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { GameServer, type GameServerOptions } from './GameServer';
import { isOriginAllowed, parseAllowedOrigins } from './originPolicy';
import { ManualScheduler } from './scheduler';
import { readServerConfig } from './serverConfig';

const PAGES = 'https://luca-vieira.github.io';
const ADMIN = { username: 'chefe', password: 'senha-bem-grande' };

describe('configuração do servidor pelo ambiente', () => {
  it('sem nada definido, escuta só na própria máquina, na porta 8787, sem origens extras, sem proxy e sem painel', () => {
    expect(readServerConfig({}, [])).toEqual({
      host: '127.0.0.1',
      port: 8787,
      dataDirectory: 'server-data',
      allowedOrigins: [],
      trustProxy: false,
      adminCredentials: null,
    });
  });

  it('lê host, porta, pasta de dados, origens, proxy e credenciais do ambiente', () => {
    const config = readServerConfig(
      { HOST: '0.0.0.0', PORT: '10000', DATA_DIR: '/data', ALLOWED_ORIGINS: `${PAGES}, https://jogo.web.app`, TRUST_PROXY: '1', ADMIN_USERNAME: 'a', ADMIN_PASSWORD: 'b' },
      [],
    );
    expect(config).toMatchObject({ host: '0.0.0.0', port: 10000, dataDirectory: '/data', allowedOrigins: [PAGES, 'https://jogo.web.app'], trustProxy: true });
    expect(config.adminCredentials).toEqual({ username: 'a', password: 'b' });
  });

  it('os argumentos valem sobre o ambiente', () => {
    const config = readServerConfig({ HOST: '10.0.0.5', PORT: '10000' }, ['--lan', '--port', '9000']);
    expect(config).toMatchObject({ host: '0.0.0.0', port: 9000 });
  });

  it('o painel só é configurado com usuário e senha, os dois', () => {
    expect(readServerConfig({ ADMIN_USERNAME: 'a' }, []).adminCredentials).toBeNull();
    expect(readServerConfig({ ADMIN_PASSWORD: 'b' }, []).adminCredentials).toBeNull();
  });

  it('recusa porta e origem inválidas com mensagem clara', () => {
    for (const port of ['abc', '0', '70000', '1.5', '']) {
      expect(() => readServerConfig({ PORT: port }, []), port).toThrow('Porta inválida');
    }
    expect(() => readServerConfig({}, ['--port'])).toThrow('Porta inválida');
    expect(() => readServerConfig({ ALLOWED_ORIGINS: 'luca.github.io' }, [])).toThrow('Origem inválida');
  });

  it('o proxy só é confiável quando ligado de propósito', () => {
    expect(readServerConfig({ TRUST_PROXY: 'true' }, []).trustProxy).toBe(true);
    for (const value of ['', '0', 'false', 'sim']) {
      expect(readServerConfig({ TRUST_PROXY: value }, []).trustProxy, value).toBe(false);
    }
  });
});

describe('origens liberadas', () => {
  it('aceita só o endereço da página (sem caminho, sem curinga, só http ou https)', () => {
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins(`${PAGES}/, https://jogo.web.app:443 ,`)).toEqual([PAGES, 'https://jogo.web.app']);
    expect(() => parseAllowedOrigins(`${PAGES}/GA-Tatics`)).toThrow('sem caminho');
    expect(() => parseAllowedOrigins('ftp://exemplo.com')).toThrow('Só http e https');
    expect(() => parseAllowedOrigins('*')).toThrow('Origem inválida');
    expect(() => parseAllowedOrigins('https://usuario:senha@exemplo.com')).toThrow('sem caminho');
  });

  it('libera exatamente o endereço configurado, e continua aceitando local e rede privada', () => {
    const allowed = [PAGES];
    expect(isOriginAllowed(PAGES, allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
    expect(isOriginAllowed('http://192.168.0.10:5173', allowed)).toBe(true);
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    // Vizinhos parecidos não passam.
    for (const other of ['https://outro.github.io', 'http://luca-vieira.github.io', 'https://luca-vieira.github.io.evil.com', `${PAGES}:8443`, 'https://evil.example.com', 'null']) {
      expect(isOriginAllowed(other, allowed), other).toBe(false);
    }
    expect(isOriginAllowed(PAGES)).toBe(false);
  });
});

describe('servidor publicado', () => {
  const servers: GameServer[] = [];
  async function startServer(options: Partial<GameServerOptions> = {}) {
    const server = new GameServer({ port: 0, scheduler: new ManualScheduler(), ...options });
    servers.push(server);
    const { port } = await server.start();
    return { port, base: `http://127.0.0.1:${port}` };
  }
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await server.stop();
    }
  });

  const closeCodeFor = (port: number, origin: string) =>
    new Promise<number | 'open'>((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
      socket.on('message', () => {
        resolve('open');
        socket.close();
      });
      socket.on('close', (code) => resolve(code));
      socket.on('error', () => undefined);
    });

  it('o jogo aceita a página publicada liberada e continua recusando as outras', async () => {
    const { port } = await startServer({ allowedOrigins: [PAGES] });
    expect(await closeCodeFor(port, PAGES)).toBe('open');
    expect(await closeCodeFor(port, 'https://evil.example.com')).toBe(1008);

    const closed = await startServer();
    expect(await closeCodeFor(closed.port, PAGES)).toBe(1008);
  });

  it('o painel aceita a página liberada (CORS) e recusa as outras', async () => {
    const { base } = await startServer({ allowedOrigins: [PAGES], adminCredentials: ADMIN });
    const login = (origin: string) =>
      fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(ADMIN) });
    const allowed = await login(PAGES);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(PAGES);
    const refused = await login('https://evil.example.com');
    expect(refused.status).toBe(403);
    expect(refused.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('GET /health responde que está de pé, sem revelar nada, e não atende outros métodos', async () => {
    const { base } = await startServer();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect((await fetch(`${base}/health`, { method: 'HEAD' })).status).toBe(200);
    expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(404);
  });

  const failLogins = async (base: string, forwardedFor: string, times: number) => {
    for (let attempt = 0; attempt < times; attempt++) {
      await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor }, body: JSON.stringify({ username: 'chefe', password: 'errada' }) });
    }
  };
  const rightLogin = (base: string, forwardedFor: string) =>
    fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor }, body: JSON.stringify(ADMIN) });

  it('atrás de um proxy, o limite de tentativas vale por pessoa (último item do X-Forwarded-For)', async () => {
    const { base } = await startServer({ adminCredentials: ADMIN, trustProxy: true });
    await failLogins(base, '203.0.113.7', 5);
    expect((await rightLogin(base, '203.0.113.7')).status).toBe(429);
    // Outra pessoa, atrás do mesmo proxy, não é afetada.
    expect((await rightLogin(base, '198.51.100.9')).status).toBe(200);
    // Inventar um endereço na frente não escapa do travamento: vale o que o proxy acrescentou por último.
    expect((await rightLogin(base, '1.2.3.4, 203.0.113.7')).status).toBe(429);
  });

  it('sem confiar no proxy, o cabeçalho é ignorado e trocar de endereço não adianta', async () => {
    const { base } = await startServer({ adminCredentials: ADMIN });
    await failLogins(base, '203.0.113.7', 5);
    expect((await rightLogin(base, '198.51.100.9')).status).toBe(429);
  });
});
