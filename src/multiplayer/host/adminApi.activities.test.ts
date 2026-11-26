import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminClient } from '@admin/adminClient';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { AdminApi } from './adminApi';
import { AdminAuth } from './adminAuth';
import { ContentStore } from './contentStore';
import type { LiveActivities, LiveActivity } from './liveActivities';
import { SpriteStore } from './spriteStore';
import { TINY_PNG } from './testPng';

const ADMIN = { username: 'chefe', password: 'senha-bem-grande' };

function fakeActivities(initial: readonly LiveActivity[]): LiveActivities {
  let rooms = [...initial];
  return {
    list: () => rooms,
    end: (roomCode) => {
      const existed = rooms.some((room) => room.roomCode === roomCode);
      rooms = rooms.filter((room) => room.roomCode !== roomCode);
      return existed;
    },
  };
}

const ROOM: LiveActivity = { roomCode: 'ABCD', status: 'playing', playerNames: ['Ana', 'Bruno'], spectatorCount: 1, round: 3 };

const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Sobe só a API do administrador, sem o servidor de partidas. */
async function startApi(options: { liveActivities?: LiveActivities; store?: ContentStore; sprites?: SpriteStore } = {}): Promise<string> {
  const api = new AdminApi({
    auth: new AdminAuth(ADMIN),
    store: options.store ?? new ContentStore(),
    sprites: options.sprites ?? new SpriteStore(),
    log: () => undefined,
    liveActivities: options.liveActivities,
  });
  const server = createServer((request, response) => {
    if (!api.handle(request, response)) {
      response.writeHead(404).end();
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function loggedClient(base: string): Promise<AdminClient> {
  const client = new AdminClient(base);
  await client.login(ADMIN.username, ADMIN.password);
  return client;
}

describe('salas em andamento pela API do administrador', () => {
  it('listar e encerrar exigem login', async () => {
    const base = await startApi({ liveActivities: fakeActivities([ROOM]) });
    expect((await fetch(`${base}/api/admin/activities`)).status).toBe(401);
    expect((await fetch(`${base}/api/admin/activities/ABCD/end`, { method: 'POST' })).status).toBe(401);
    const client = await loggedClient(base);
    expect(await client.fetchActivities()).toEqual([ROOM]);
  });

  it('encerra a sala uma vez; depois ela não existe mais', async () => {
    const client = await loggedClient(await startApi({ liveActivities: fakeActivities([ROOM]) }));
    expect(await client.endActivity('ABCD')).toBe(true);
    expect(await client.fetchActivities()).toEqual([]);
    expect(await client.endActivity('ABCD')).toBe(false);
  });

  it('recusa páginas de fora e métodos errados', async () => {
    const base = await startApi({ liveActivities: fakeActivities([ROOM]) });
    const outsider = await fetch(`${base}/api/admin/activities/ABCD/end`, { method: 'POST', headers: { Origin: 'https://evil.example.com' } });
    expect(outsider.status).toBe(403);
    expect((await fetch(`${base}/api/admin/activities`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/api/admin/activities/ABCD/end`)).status).toBe(404);
  });

  it('sem o servidor de partidas ligado à API, responde 501 com uma explicação no painel', async () => {
    const client = await loggedClient(await startApi());
    await expect(client.fetchActivities()).rejects.toThrow('não permite ver nem encerrar');
    await expect(client.endActivity('ABCD')).rejects.toThrow('não permite ver nem encerrar');
  });
});

describe('sprites auxiliares publicados', () => {
  const contentWithHorse = (path: string) => ({
    ...structuredClone(DEFAULT_GAME_CONTENT),
    auxiliarySprites: { cavalo: { path, scale: 1.4, offsetX: 3, offsetY: -2, anchorX: 0.4, anchorY: 0.9 } },
  });

  it('só publica o que foi enviado a este servidor', async () => {
    const client = await loggedClient(await startApi());
    const missing = await client.publish(1, contentWithHorse('/sprites/aux_cavalo-000000000000.png'));
    expect(!missing.ok && missing.issues.join('\n')).toContain('auxiliarySprites.cavalo.path: o sprite não foi enviado');
  });

  it('o sprite e os ajustes continuam depois de reiniciar o servidor', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'merge-admin-'));
    directories.push(directory);
    const filePath = join(directory, 'content.json');
    const spriteDirectory = join(directory, 'sprites');
    const client = await loggedClient(await startApi({ store: new ContentStore({ filePath }), sprites: new SpriteStore(spriteDirectory) }));

    const path = await client.uploadSprite('aux_cavalo', new Uint8Array(TINY_PNG));
    expect(path).toMatch(/^\/sprites\/aux_cavalo-[0-9a-f]{12}\.png$/);
    const content = contentWithHorse(path);
    expect(await client.publish(1, content)).toEqual({ ok: true, version: 2 });

    const afterRestart = new ContentStore({ filePath });
    expect(afterRestart.snapshot.content.auxiliarySprites).toEqual(content.auxiliarySprites);
    expect(new SpriteStore(spriteDirectory).has(path)).toBe(true);
  });
});
