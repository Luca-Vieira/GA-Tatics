import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { ContentStore } from '../multiplayer/host/contentStore';
import { GameServer } from '../multiplayer/host/GameServer';
import { ManualScheduler } from '../multiplayer/host/scheduler';
import { AdminClient, AdminRequestError } from './adminClient';
import { applySectionText, sectionText } from './editorState';
import { TINY_PNG } from '../multiplayer/host/testPng';
import { checkSpriteBytes } from './spriteFile';

const ADMIN = { username: 'chefe', password: 'senha-bem-grande' };

describe('cliente do painel de administração (contra o servidor real)', () => {
  const servers: GameServer[] = [];

  async function startServer(): Promise<{ base: string; store: ContentStore }> {
    const store = new ContentStore();
    const server = new GameServer({ port: 0, scheduler: new ManualScheduler(), contentStore: store, adminCredentials: ADMIN });
    servers.push(server);
    const { port } = await server.start();
    return { base: `http://127.0.0.1:${port}`, store };
  }

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await server.stop();
    }
  });

  it('entra, lê o conteúdo e publica uma alteração', async () => {
    const { base, store } = await startServer();
    const client = new AdminClient(base);
    await client.login(ADMIN.username, ADMIN.password);
    expect(client.isLoggedIn).toBe(true);

    const published = await client.fetchContent();
    expect(published.version).toBe(1);
    expect(published.content).toEqual(DEFAULT_GAME_CONTENT);

    const edited = applySectionText(published.content, 'config', sectionText(published.content, 'config').replace('"incomePerRound": 2', '"incomePerRound": 4'));
    if (!edited.ok) throw new Error(edited.error);
    const result = await client.publish(published.version, edited.content);
    expect(result).toEqual({ ok: true, version: 2 });
    expect(store.snapshot.content.config.tower.incomePerRound).toBe(4);
  });

  it('login com senha errada, depois de muitas tentativas e sem painel, dá mensagens claras', async () => {
    const { base } = await startServer();
    const client = new AdminClient(base);
    await expect(client.login('chefe', 'errada')).rejects.toMatchObject({ kind: 'unauthorized', message: expect.stringContaining('incorretos') });
    for (let attempt = 0; attempt < 5; attempt++) {
      await client.login('chefe', 'errada').catch(() => undefined);
    }
    await expect(client.login(ADMIN.username, ADMIN.password)).rejects.toMatchObject({ kind: 'locked' });
    expect(client.isLoggedIn).toBe(false);
  });

  it('conflito de versão e conteúdo inválido voltam como resultados explicados, sem lançar erro', async () => {
    const { base } = await startServer();
    const client = new AdminClient(base);
    await client.login(ADMIN.username, ADMIN.password);
    const { content } = await client.fetchContent();

    const conflict = await client.publish(99, content);
    expect(conflict).toMatchObject({ ok: false, kind: 'conflict' });

    const broken = JSON.parse(JSON.stringify(content));
    broken.characters[0].stats.health = 99;
    const invalid = await client.publish(1, broken);
    expect(invalid).toMatchObject({ ok: false, kind: 'invalid' });
    expect(!invalid.ok && invalid.issues.join('\n')).toContain('characters.0.stats.health');
  });

  it('sair invalida o token, e um servidor fora do ar vira erro legível', async () => {
    const { base } = await startServer();
    const client = new AdminClient(base);
    await client.login(ADMIN.username, ADMIN.password);
    await client.logout();
    expect(client.isLoggedIn).toBe(false);
    await expect(client.fetchContent()).rejects.toBeInstanceOf(AdminRequestError);

    const unreachable = new AdminClient('http://127.0.0.1:1');
    await expect(unreachable.login('a', 'b')).rejects.toMatchObject({ kind: 'unreachable' });
  });

  it('envia um sprite e depois publica o personagem apontando para ele', async () => {
    const { base, store } = await startServer();
    const client = new AdminClient(base);
    await client.login(ADMIN.username, ADMIN.password);
    const path = await client.uploadSprite('bixo', new Uint8Array(TINY_PNG));
    expect(path).toMatch(/^\/sprites\/bixo-[0-9a-f]{12}\.png$/);
    expect((await fetch(`${base}${path}`)).status).toBe(200);

    const { content, version } = await client.fetchContent();
    const edited = JSON.parse(JSON.stringify(content));
    edited.characters[0].sprite = { path, scale: 1, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 1 };
    expect(await client.publish(version, edited)).toMatchObject({ ok: true });
    expect(store.snapshot.content.characters[0]?.sprite?.path).toBe(path);
  });

  it('o envio de sprite explica as recusas (arquivo ruim, sem login)', async () => {
    const { base } = await startServer();
    const client = new AdminClient(base);
    await expect(client.uploadSprite('bixo', new Uint8Array(TINY_PNG))).rejects.toMatchObject({ kind: 'unauthorized' });
    await client.login(ADMIN.username, ADMIN.password);
    await expect(client.uploadSprite('bixo', new TextEncoder().encode('não sou png'))).rejects.toThrow('PNG íntegro');
  });
});

describe('checagem do arquivo de sprite no navegador', () => {
  it('aceita PNG pequeno e recusa o que o servidor recusaria', () => {
    expect(checkSpriteBytes(new Uint8Array(TINY_PNG))).toBeNull();
    expect(checkSpriteBytes(new TextEncoder().encode('GIF89a......................................'))).toContain('não é um PNG');
    expect(checkSpriteBytes(new Uint8Array(2 * 1024 * 1024))).toContain('limite é 1 MB');
    const huge = new Uint8Array(TINY_PNG);
    new DataView(huge.buffer).setUint32(16, 5000);
    expect(checkSpriteBytes(huge)).toContain('5000×1');
  });
});
