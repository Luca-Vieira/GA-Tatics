import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ClientMessage } from '../protocol/clientMessages';
import { PROTOCOL_VERSION, type ServerMessage } from '../protocol/serverMessages';
import { DEFAULT_COMBAT_TIME_LIMIT_MS } from '@combat/engine/constants';
import { GameServer } from './GameServer';
import { ManualScheduler } from './scheduler';

/** Cliente de teste: guarda tudo o que o servidor mandar e deixa esperar por uma mensagem específica. */
class TestClient {
  readonly messages: ServerMessage[] = [];
  closeCode: number | null = null;
  private readonly socket: WebSocket;
  private readonly waiters: (() => void)[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()) as ServerMessage);
      this.waiters.splice(0).forEach((wake) => wake());
    });
    socket.on('close', (code) => {
      this.closeCode = code;
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }

  static async connect(port: number, origin?: string): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    const client = new TestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    await client.waitFor('hello');
    return client;
  }

  send(message: ClientMessage | string): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  of<Type extends ServerMessage['type']>(type: Type): Extract<ServerMessage, { type: Type }>[] {
    return this.messages.filter((message): message is Extract<ServerMessage, { type: Type }> => message.type === type);
  }

  /** Espera pela `occurrence`-ésima mensagem do tipo (1 = a primeira). */
  async waitFor<Type extends ServerMessage['type']>(type: Type, occurrence = 1): Promise<Extract<ServerMessage, { type: Type }>> {
    const deadline = Date.now() + 5000;
    while (this.of(type).length < occurrence) {
      if (this.closeCode !== null || Date.now() > deadline) {
        throw new Error(`Mensagem "${type}" não chegou (conexão ${this.closeCode === null ? 'aberta' : `fechada: ${this.closeCode}`}).`);
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
    return this.of(type)[occurrence - 1]!;
  }

  async waitForClose(): Promise<number> {
    const deadline = Date.now() + 5000;
    while (this.closeCode === null && Date.now() < deadline) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
    return this.closeCode ?? -1;
  }

  close(): void {
    this.socket.close();
  }
}

describe('servidor WebSocket', () => {
  let server: GameServer;
  let scheduler: ManualScheduler;
  let port: number;
  const clients: TestClient[] = [];

  async function connect(origin?: string): Promise<TestClient> {
    const client = await TestClient.connect(port, origin);
    clients.push(client);
    return client;
  }

  beforeEach(async () => {
    scheduler = new ManualScheduler();
    server = new GameServer({ port: 0, scheduler, maximumConnections: 6, messageBurst: 12, messagesPerSecond: 1 });
    ({ port } = await server.start());
  });

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.close());
    await server.stop();
  });

  it('por padrão só escuta na própria máquina', async () => {
    const lanServer = new GameServer({ port: 0 });
    const address = await lanServer.start();
    await lanServer.stop();
    expect(address.host).toBe('127.0.0.1');
  });

  it('cumprimenta quem conecta e cria a sala', async () => {
    const ana = await connect();
    const hello = await ana.waitFor('hello');
    expect(hello.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(hello.contentVersion).toBe(1);
    expect(hello.content.characters.length).toBeGreaterThan(0);
    ana.send({ type: 'create_room', playerName: 'Ana' });
    const joined = await ana.waitFor('room_joined');
    expect(joined.roomCode).toMatch(/^[A-Z]{4}$/);
    expect(joined.playerId).toBe('p1');
  });

  it('dois jogadores entram na mesma sala e só o anfitrião inicia a partida', async () => {
    const ana = await connect();
    const beto = await connect();
    ana.send({ type: 'create_room', playerName: 'Ana' });
    const { roomCode } = await ana.waitFor('room_joined');
    beto.send({ type: 'join_room', roomCode: roomCode.toLowerCase(), playerName: 'Beto' });
    await beto.waitFor('room_joined');

    beto.send({ type: 'start_match' });
    expect((await beto.waitFor('error')).code).toBe('not_host');

    ana.send({ type: 'start_match' });
    const started = await ana.waitFor('match_started');
    expect(started.players.map((player) => player.name)).toEqual(['Ana', 'Beto', 'Bot 1', 'Bot 2']);
    await beto.waitFor('round_started');
    expect((await ana.waitFor('player_view')).view.coins).toBe(5);
  });

  it('joga uma rodada de ponta a ponta pela rede: compra, fica pronto, recebe o duelo e o resultado', async () => {
    const ana = await connect();
    const beto = await connect();
    ana.send({ type: 'create_room', playerName: 'Ana' });
    const { roomCode } = await ana.waitFor('room_joined');
    beto.send({ type: 'join_room', roomCode, playerName: 'Beto' });
    await beto.waitFor('room_joined');
    ana.send({ type: 'start_match' });
    await ana.waitFor('round_started');

    ana.send({ type: 'buy', shopSlot: 0 });
    expect(await ana.waitFor('action_result')).toEqual({ type: 'action_result', ok: true, fusionCount: 0 });
    ana.send({ type: 'move', unitId: 'p1-u1', destination: { kind: 'board', cell: { q: 0, r: 3 } } });
    expect(await ana.waitFor('action_result', 2)).toEqual({ type: 'action_result', ok: true, fusionCount: 0 });
    ana.send({ type: 'set_ready', ready: true });
    beto.send({ type: 'set_ready', ready: true });
    await ana.waitFor('player_view', 4);
    await beto.waitFor('player_view', 2);
    scheduler.advance(0);

    const combat = await ana.waitFor('combat_started');
    expect(combat.duel?.combatConfig.units.length).toBeGreaterThan(0);
    scheduler.advance(DEFAULT_COMBAT_TIME_LIMIT_MS + 1000);
    const result = await ana.waitFor('round_result');
    expect(result.round).toBe(1);
    expect(result.players).toHaveLength(4);
    // Os dois humanos recebem o mesmo resultado oficial.
    expect((await beto.waitFor('round_result')).duels).toEqual(result.duels);
  });

  it('recusa mensagens inválidas sem derrubar a conexão', async () => {
    const ana = await connect();
    ana.send('{isto não é json');
    expect((await ana.waitFor('error', 1)).code).toBe('invalid_json');
    ana.send({ type: 'buy', shopSlot: 999 } as unknown as ClientMessage);
    expect((await ana.waitFor('error', 2)).code).toBe('invalid_message');
    ana.send({ type: 'buy', shopSlot: 0 });
    expect((await ana.waitFor('error', 3)).code).toBe('not_in_room');
    ana.send({ type: 'create_room', playerName: 'Ana' });
    await ana.waitFor('room_joined');
  });

  it('fecha a conexão de quem manda mensagem gigante', async () => {
    const intruso = await connect();
    intruso.send(JSON.stringify({ type: 'create_room', playerName: 'x'.repeat(100_000) }));
    // O servidor manda 1009 (mensagem grande demais); o cliente pode ver 1006 se a conexão cair antes do quadro de fechamento.
    expect([1009, 1006]).toContain(await intruso.waitForClose());
    for (let attempt = 0; attempt < 50 && server.connectionCount > 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(server.connectionCount).toBe(0);
  });

  it('segura quem manda mensagens rápido demais', async () => {
    const spammer = await connect();
    for (let sent = 0; sent < 30; sent++) {
      spammer.send({ type: 'leave_room' });
    }
    await spammer.waitFor('error', 30);
    expect(spammer.of('error').some((message) => message.code === 'rate_limited')).toBe(true);
  });

  it('recusa páginas da internet e aceita páginas da rede local', async () => {
    const outsider = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://evil.example.com' });
    const closeCode = await new Promise<number>((resolve) => outsider.on('close', (code) => resolve(code)));
    expect(closeCode).toBe(1008);

    const local = await connect('http://192.168.0.10:5173');
    local.send({ type: 'create_room', playerName: 'Ana' });
    await local.waitFor('room_joined');
  });

  it('respeita o limite de conexões simultâneas', async () => {
    for (let index = 0; index < 6; index++) {
      await connect();
    }
    const extra = new WebSocket(`ws://127.0.0.1:${port}`);
    const closeCode = await new Promise<number>((resolve) => extra.on('close', (code) => resolve(code)));
    expect(closeCode).toBe(1013);
    expect(server.connectionCount).toBe(6);
  });

  it('quem cai da conexão libera a vaga e a sala some quando fica vazia', async () => {
    const ana = await connect();
    ana.send({ type: 'create_room', playerName: 'Ana' });
    await ana.waitFor('room_joined');
    expect(server.roomCount).toBe(1);
    ana.close();
    for (let attempt = 0; attempt < 50 && server.roomCount > 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(server.roomCount).toBe(0);
    expect(server.connectionCount).toBe(0);
  });

  it('um cliente com mensagem estranha não afeta os outros', async () => {
    const ana = await connect();
    const beto = await connect();
    ana.send({ type: 'create_room', playerName: 'Ana' });
    await ana.waitFor('room_joined');
    beto.send(Buffer.from([0, 1, 2, 3]) as unknown as string);
    expect((await beto.waitFor('error')).code).toBe('invalid_message');
    ana.send({ type: 'leave_room' });
    await ana.waitFor('room_state');
    expect(server.connectionCount).toBe(2);
  });
});
