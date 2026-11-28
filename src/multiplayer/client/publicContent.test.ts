import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { GameServer } from '../host/GameServer';
import { fetchPublicContent } from './publicContent';

describe('conteúdo público do servidor', () => {
  let server: GameServer | null = null;
  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it('é entregue sem login e sem conectar, com o elenco publicado', async () => {
    server = new GameServer({ port: 0 });
    const { port } = await server.start();
    const content = await fetchPublicContent(`http://127.0.0.1:${port}`);
    expect(content?.characters.map((character) => character.id)).toEqual(DEFAULT_GAME_CONTENT.characters.map((character) => character.id));
  });

  it('devolve null se o servidor não existe, responde erro ou manda conteúdo inválido', async () => {
    expect(await fetchPublicContent('http://127.0.0.1:1', 500)).toBeNull();
    const answering = (status: number, body: string) => (async () => new Response(body, { status })) as typeof fetch;
    expect(await fetchPublicContent('http://x', 500, answering(404, ''))).toBeNull();
    expect(await fetchPublicContent('http://x', 500, answering(200, '{"content":{"characters":[]}}'))).toBeNull();
  });
});
