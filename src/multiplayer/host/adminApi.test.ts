import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { LobbyClient } from '../client/LobbyClient';
import { ServerConnection } from '../client/ServerConnection';
import { ContentStore } from './contentStore';
import { GameServer } from './GameServer';
import { ManualScheduler } from './scheduler';

/** Objeto JSON editável nos testes (o conteúdo é validado em tempo de execução, não pelo compilador). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

const ADMIN = { username: 'chefe', password: 'senha-bem-grande' };
const clone = () => JSON.parse(JSON.stringify(DEFAULT_GAME_CONTENT)) as JsonObject;

async function eventually(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Não aconteceu a tempo: ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('API do painel de administração', () => {
  const servers: GameServer[] = [];
  const connections: ServerConnection[] = [];

  async function startServer(options: { admin?: typeof ADMIN | null; store?: ContentStore } = {}) {
    const store = options.store ?? new ContentStore();
    const server = new GameServer({ port: 0, scheduler: new ManualScheduler(), contentStore: store, adminCredentials: options.admin === undefined ? ADMIN : options.admin });
    servers.push(server);
    const { port } = await server.start();
    return { base: `http://127.0.0.1:${port}`, port, store };
  }

  async function api(base: string, path: string, init: { method?: string; token?: string; body?: unknown; origin?: string; raw?: string; contentType?: string } = {}) {
    const headers: Record<string, string> = {};
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.origin) headers.Origin = init.origin;
    const hasBody = init.body !== undefined || init.raw !== undefined;
    if (hasBody) headers['Content-Type'] = init.contentType ?? 'application/json';
    const response = await fetch(`${base}${path}`, { method: init.method ?? 'GET', headers, body: hasBody ? (init.raw ?? JSON.stringify(init.body)) : undefined });
    const text = await response.text();
    return { status: response.status, headers: response.headers, json: text ? (JSON.parse(text) as JsonObject) : null };
  }

  async function login(base: string): Promise<string> {
    const result = await api(base, '/api/admin/login', { method: 'POST', body: ADMIN });
    return result.json!.token as string;
  }

  afterEach(async () => {
    connections.splice(0).forEach((connection) => connection.close());
    for (const server of servers.splice(0)) {
      await server.stop();
    }
  });

  it('sem usuário e senha configurados, o painel fica desligado', async () => {
    const { base } = await startServer({ admin: null });
    expect((await api(base, '/api/admin/login', { method: 'POST', body: ADMIN })).status).toBe(503);
    const weak = await startServer({ admin: { username: 'a', password: 'curta' } });
    expect((await api(weak.base, '/api/admin/content')).status).toBe(503);
  });

  it('login: senha certa entra, errada é recusada, e o excesso de tentativas trava', async () => {
    const { base } = await startServer();
    const wrong = await api(base, '/api/admin/login', { method: 'POST', body: { username: 'chefe', password: 'errada' } });
    expect(wrong.status).toBe(401);
    expect(JSON.stringify(wrong.json)).not.toContain('senha-bem-grande');
    expect((await api(base, '/api/admin/login', { method: 'POST', body: ADMIN })).status).toBe(200);
    for (let attempt = 0; attempt < 5; attempt++) {
      await api(base, '/api/admin/login', { method: 'POST', body: { username: 'chefe', password: 'errada' } });
    }
    expect((await api(base, '/api/admin/login', { method: 'POST', body: ADMIN })).status).toBe(429);
  });

  it('o conteúdo só é lido e gravado com token válido', async () => {
    const { base } = await startServer();
    expect((await api(base, '/api/admin/content')).status).toBe(401);
    expect((await api(base, '/api/admin/content', { token: 'inventado' })).status).toBe(401);
    expect((await api(base, '/api/admin/content', { method: 'PUT', body: { baseVersion: 1, content: clone() } })).status).toBe(401);

    const token = await login(base);
    const read = await api(base, '/api/admin/content', { token });
    expect(read.status).toBe(200);
    expect(read.json!.version).toBe(1);
    expect(read.json!.content.characters).toHaveLength(13);

    await api(base, '/api/admin/logout', { method: 'POST', token });
    expect((await api(base, '/api/admin/content', { token })).status).toBe(401);
  });

  it('publicar: valida (422), confere a versão (409) e grava', async () => {
    const { base, store } = await startServer();
    const token = await login(base);

    const broken = clone();
    broken.characters[0].stats.health = 99;
    const invalid = await api(base, '/api/admin/content', { method: 'PUT', token, body: { baseVersion: 1, content: broken } });
    expect(invalid.status).toBe(422);
    expect(invalid.json!.details.issues.join('\n')).toContain('characters.0.stats.health');

    const edited = clone();
    edited.config.rounds.startingLives = 6;
    expect((await api(base, '/api/admin/content', { method: 'PUT', token, body: { baseVersion: 99, content: edited } })).status).toBe(409);
    expect(store.snapshot.version).toBe(1);

    const published = await api(base, '/api/admin/content', { method: 'PUT', token, body: { baseVersion: 1, content: edited } });
    expect(published.status).toBe(200);
    expect(published.json!.version).toBe(2);
    expect(store.snapshot.content.config.rounds.startingLives).toBe(6);
    // Quem leu a versão antiga e tenta publicar de novo é barrado.
    expect((await api(base, '/api/admin/content', { method: 'PUT', token, body: { baseVersion: 1, content: edited } })).status).toBe(409);
  });

  it('recusa corpo que não é JSON, tipo errado e corpo grande demais', async () => {
    const { base } = await startServer();
    const token = await login(base);
    expect((await api(base, '/api/admin/content', { method: 'PUT', token, raw: '{quebrado' })).status).toBe(400);
    expect((await api(base, '/api/admin/content', { method: 'PUT', token, raw: '{}', contentType: 'text/plain' })).status).toBe(415);
    expect((await api(base, '/api/admin/login', { method: 'POST', raw: JSON.stringify({ username: 'x'.repeat(10_000), password: 'y' }) })).status).toBe(413);
  });

  it('só aceita páginas da rede local ou privada (CORS)', async () => {
    const { base } = await startServer();
    const outsider = await api(base, '/api/admin/login', { method: 'POST', body: ADMIN, origin: 'https://evil.example.com' });
    expect(outsider.status).toBe(403);
    expect(outsider.headers.get('access-control-allow-origin')).toBeNull();

    const local = await api(base, '/api/admin/login', { method: 'POST', body: ADMIN, origin: 'http://localhost:5173' });
    expect(local.status).toBe(200);
    expect(local.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const preflight = await fetch(`${base}/api/admin/content`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  it('rotas desconhecidas dão 404 e o resto do servidor responde normalmente', async () => {
    const { base } = await startServer();
    const token = await login(base);
    expect((await api(base, '/api/admin/nada', { token })).status).toBe(404);
    expect((await fetch(`${base}/qualquer-coisa`)).status).toBe(404);
  });

  it('publicar avisa os jogadores conectados; partida nova usa o conteúdo novo e quem não recarregou é barrado', async () => {
    const { base, port } = await startServer();
    const token = await login(base);

    const connect = async () => {
      const connection = await ServerConnection.connect(`ws://127.0.0.1:${port}`);
      connections.push(connection);
      return new LobbyClient(connection);
    };
    const host = await connect();
    expect(host.isContentStale).toBe(false);
    let staleCalls = 0;
    host.onContentStale(() => staleCalls++);

    const edited = clone();
    edited.config.rounds.startingLives = 6;
    expect((await api(base, '/api/admin/content', { method: 'PUT', token, body: { baseVersion: 1, content: edited } })).status).toBe(200);
    await eventually(() => host.isContentStale, 'aviso de conteúdo novo');
    expect(staleCalls).toBe(1);

    // Quem se conecta depois já recebe o conteúdo novo e joga com ele.
    const fresh = await connect();
    expect(fresh.isContentStale).toBe(false);
    let freshSession: Awaited<ReturnType<typeof startAndWait>> | null = null;
    async function startAndWait() {
      const sessions: unknown[] = [];
      fresh.onMatchStarted((session) => sessions.push(session));
      fresh.createRoom('Nova');
      await eventually(() => fresh.isInRoom, 'sala');
      fresh.startMatch();
      await eventually(() => sessions.length === 1, 'partida');
      return sessions[0] as { match: { config: { rounds: { startingLives: number } }; getPlayer: (id: string) => { lives: number } } };
    }
    freshSession = await startAndWait();
    expect(freshSession.match.config.rounds.startingLives).toBe(6);
    expect(freshSession.match.getPlayer('p1').lives).toBe(6);

    // Quem tinha a página aberta antes (conteúdo antigo) não consegue começar partida: é avisado e sai da sala.
    let oldSessions = 0;
    host.onMatchStarted(() => oldSessions++);
    host.createRoom('Antigo');
    await eventually(() => host.isInRoom, 'sala do antigo');
    host.startMatch();
    await eventually(() => !host.isInRoom, 'saída da sala');
    expect(oldSessions).toBe(0);
    expect(staleCalls).toBeGreaterThanOrEqual(1);
  });
});
