import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { ContentStore } from './contentStore';
import { GameServer } from './GameServer';
import { ManualScheduler } from './scheduler';
import { MAXIMUM_SPRITE_BYTES } from './spriteStore';
import { TINY_PNG } from './testPng';

const ADMIN = { username: 'chefe', password: 'senha-bem-grande' };

describe('sprites pela API do administrador', () => {
  const servers: GameServer[] = [];

  async function startServer() {
    const store = new ContentStore();
    const server = new GameServer({ port: 0, scheduler: new ManualScheduler(), contentStore: store, adminCredentials: ADMIN });
    servers.push(server);
    const { port } = await server.start();
    return { base: `http://127.0.0.1:${port}`, store };
  }

  async function login(base: string): Promise<string> {
    const response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN) });
    return ((await response.json()) as { token: string }).token;
  }

  const upload = (base: string, characterId: string, body: Buffer | string, options: { token?: string; contentType?: string } = {}) =>
    fetch(`${base}/api/admin/sprites/${characterId}`, {
      method: 'PUT',
      headers: { ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), 'Content-Type': options.contentType ?? 'image/png' },
      body: body as BodyInit,
    });

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await server.stop();
    }
  });

  it('o envio exige login, aceita só PNG e devolve o caminho público', async () => {
    const { base } = await startServer();
    expect((await upload(base, 'bixo', TINY_PNG)).status).toBe(401);
    const token = await login(base);

    const accepted = await upload(base, 'bixo', TINY_PNG, { token });
    expect(accepted.status).toBe(200);
    const { path } = (await accepted.json()) as { path: string };
    expect(path).toMatch(/^\/sprites\/bixo-[0-9a-f]{12}\.png$/);

    expect((await upload(base, 'bixo', TINY_PNG, { token, contentType: 'text/plain' })).status).toBe(415);
    expect((await upload(base, 'bixo', Buffer.from('<svg onload=alert(1)></svg>'), { token })).status).toBe(422);
    expect((await upload(base, 'BIXO', TINY_PNG, { token })).status).toBe(400);
    expect((await upload(base, 'bixo', Buffer.concat([TINY_PNG, Buffer.alloc(MAXIMUM_SPRITE_BYTES)]), { token })).status).toBe(413);
  });

  it('qualquer pessoa vê o sprite enviado, com os cabeçalhos certos; o que não existe dá 404', async () => {
    const { base } = await startServer();
    const token = await login(base);
    const { path } = (await (await upload(base, 'leo', TINY_PNG, { token })).json()) as { path: string };

    const response = await fetch(`${base}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await response.arrayBuffer()).equals(TINY_PNG)).toBe(true);

    expect((await fetch(`${base}/sprites/leo-000000000000.png`)).status).toBe(404);
    expect((await fetch(`${base}/sprites/..%2Fcontent.json`)).status).toBe(404);
    expect((await fetch(`${base}${path}`, { method: 'POST' })).status).toBe(404);
  });

  it('só dá para publicar um personagem com sprite que foi enviado ao servidor', async () => {
    const { base, store } = await startServer();
    const token = await login(base);
    const { path } = (await (await upload(base, 'bixo', TINY_PNG, { token })).json()) as { path: string };

    const publish = async (spritePath: string) => {
      const content = JSON.parse(JSON.stringify(DEFAULT_GAME_CONTENT));
      content.characters[0].sprite = { path: spritePath, scale: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 1 };
      const response = await fetch(`${base}/api/admin/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion: store.snapshot.version, content }),
      });
      return { status: response.status, json: (await response.json()) as { details?: { issues: string[] } } };
    };

    // Caminho com cara certa, mas que não foi enviado.
    const missing = await publish('/sprites/bixo-000000000000.png');
    expect(missing.status).toBe(422);
    expect(missing.json.details?.issues.join('\n')).toContain('não foi enviado');
    // Caminhos que não seguem o formato do servidor nem chegam à conferência.
    for (const outsider of ['https://evil.example.com/x.png', '//evil.example.com/x.png', '/sprites/../x.png', 'bixo.png']) {
      const result = await publish(outsider);
      expect(result.status).toBe(422);
      expect(result.json.details?.issues.join('\n')).toContain('enviado pelo painel');
    }
    expect((await publish(path)).status).toBe(200);
    expect(store.snapshot.content.characters[0]?.sprite?.path).toBe(path);
  });
});
