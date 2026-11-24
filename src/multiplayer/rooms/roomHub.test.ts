import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_ROOM_MODIFIERS } from '@data/schemas/roomModifiers';
import WebSocket from 'ws';
import { GameServer } from '../host/GameServer';
import { ManualScheduler } from '../host/scheduler';
import { parseClientMessage } from '../protocol/clientMessages';
import type { ServerMessage } from '../protocol/serverMessages';
import type { RoomDependencies } from './Room';
import { RoomPassword } from './roomPassword';
import { RoomRegistry } from './RoomRegistry';

const noopDependencies: RoomDependencies = { scheduler: new ManualScheduler(), send: () => undefined, createMatchSeed: () => 'semente' };

describe('senha de sala', () => {
  it('só confere com a senha certa e dois resumos da mesma senha são diferentes (sal próprio)', () => {
    const password = RoomPassword.create('segredo');
    expect(password.matches('segredo')).toBe(true);
    expect(password.matches('Segredo')).toBe(false);
    expect(password.matches('')).toBe(false);
    expect(JSON.stringify(RoomPassword.create('segredo'))).not.toBe(JSON.stringify(password));
  });
});

describe('mensagens do saguão', () => {
  const parse = (message: unknown) => parseClientMessage(JSON.stringify(message));

  it('criar sala: visibilidade pública e regras normais por padrão', () => {
    const result = parse({ type: 'create_room', playerName: 'Ana' });
    expect(result).toEqual({ ok: true, message: { type: 'create_room', playerName: 'Ana', visibility: 'public', modifiers: NO_ROOM_MODIFIERS } });
  });

  it('aceita sala privada com senha e regras especiais; recusa regras fora do teto e campos desconhecidos', () => {
    expect(parse({ type: 'create_room', playerName: 'Ana', visibility: 'private', password: 'abc', modifiers: { extraLives: 2, statBonusPercent: 25 } })).toMatchObject({ ok: true });
    expect(parse({ type: 'create_room', playerName: 'Ana', modifiers: { extraLives: 9 } })).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse({ type: 'create_room', playerName: 'Ana', visibility: 'secreta' })).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse({ type: 'create_room', playerName: 'Ana', modifiers: { bonusSecreto: 1 } })).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse({ type: 'create_room', playerName: 'Ana', password: '' })).toEqual({ ok: false, reason: 'invalid_message' });
    expect(parse({ type: 'create_room', playerName: 'Ana', password: 'x'.repeat(21) })).toEqual({ ok: false, reason: 'invalid_message' });
  });

  it('entrar com senha, listar salas e partida rápida são mensagens válidas', () => {
    expect(parse({ type: 'join_room', roomCode: 'ABCD', playerName: 'Beto', password: 'abc' })).toMatchObject({ ok: true });
    expect(parse({ type: 'list_rooms' })).toMatchObject({ ok: true });
    expect(parse({ type: 'quick_match', playerName: 'Ana' })).toMatchObject({ ok: true });
    expect(parse({ type: 'list_rooms', extra: 1 })).toEqual({ ok: false, reason: 'invalid_message' });
  });
});

describe('registro de salas: visibilidade, senha e partida rápida', () => {
  let registry: RoomRegistry;
  let counter: number;
  beforeEach(() => {
    counter = 0;
    registry = new RoomRegistry({ dependencies: noopDependencies, maximumRooms: 10, createRoomCode: () => String.fromCharCode(65 + counter++).repeat(4) });
  });

  it('a lista mostra só as salas públicas, com anfitrião, vagas, cadeado e regras', () => {
    registry.createRoom('c1', 'Ana', { visibility: 'public', modifiers: { ...NO_ROOM_MODIFIERS, extraLives: 2 } });
    registry.createRoom('c2', 'Beto', { visibility: 'private', modifiers: NO_ROOM_MODIFIERS });
    registry.createRoom('c3', 'Caio', { visibility: 'public', password: 'segredo', modifiers: NO_ROOM_MODIFIERS });
    const list = registry.listPublicRooms();
    expect(list.map((room) => [room.roomCode, room.hostName, room.hasPassword])).toEqual([
      ['AAAA', 'Ana', false],
      ['CCCC', 'Caio', true],
    ]);
    expect(list[0]).toMatchObject({ playerCount: 1, maximumPlayers: 4, status: 'lobby', modifiers: { extraLives: 2 } });
    expect(JSON.stringify(list)).not.toContain('segredo');
  });

  it('uma sala privada continua acessível pelo código', () => {
    registry.createRoom('c1', 'Ana', { visibility: 'private', modifiers: NO_ROOM_MODIFIERS });
    expect(registry.joinRoom('c2', 'AAAA', 'Beto').ok).toBe(true);
  });

  it('a senha é obrigatória e conferida antes de qualquer outra coisa', () => {
    registry.createRoom('c1', 'Ana', { visibility: 'public', password: 'segredo', modifiers: NO_ROOM_MODIFIERS });
    expect(registry.joinRoom('c2', 'AAAA', 'Beto')).toEqual({ ok: false, code: 'wrong_password' });
    expect(registry.joinRoom('c2', 'AAAA', 'Beto', 'errada')).toEqual({ ok: false, code: 'wrong_password' });
    expect(registry.joinRoom('c2', 'AAAA', 'Beto', 'segredo').ok).toBe(true);
  });

  it('partida rápida entra numa sala aberta pública e sem senha, preferindo a de regras normais', () => {
    registry.createRoom('c1', 'Ana', { visibility: 'public', modifiers: { ...NO_ROOM_MODIFIERS, statBonusPercent: 50 } });
    registry.createRoom('c2', 'Beto', { visibility: 'public', modifiers: NO_ROOM_MODIFIERS });
    registry.createRoom('c3', 'Caio', { visibility: 'public', password: 'x', modifiers: NO_ROOM_MODIFIERS });
    registry.createRoom('c4', 'Duda', { visibility: 'private', modifiers: NO_ROOM_MODIFIERS });
    const result = registry.quickMatch('c5', 'Eva');
    expect(result.ok && result.value.code).toBe('BBBB');
  });

  it('sem sala aberta, a partida rápida cria uma sala pública com as regras normais', () => {
    registry.createRoom('c1', 'Ana', { visibility: 'private', modifiers: NO_ROOM_MODIFIERS });
    const result = registry.quickMatch('c2', 'Beto');
    expect(result.ok && result.value.visibility).toBe('public');
    expect(result.ok && result.value.modifiers).toEqual(NO_ROOM_MODIFIERS);
    expect(registry.roomCount).toBe(2);
  });

  it('salas cheias não recebem partida rápida, e quem já está numa sala não pode usá-la', () => {
    registry.createRoom('c1', 'Ana');
    ['c2', 'c3', 'c4'].forEach((id) => registry.joinRoom(id, 'AAAA', id));
    const result = registry.quickMatch('c5', 'Eva');
    expect(result.ok && result.value.code).not.toBe('AAAA');
    expect(registry.quickMatch('c1', 'Ana')).toEqual({ ok: false, code: 'already_in_room' });
  });
});

/** Cliente de teste simples (mensagens como JSON). */
class Client {
  readonly messages: ServerMessage[] = [];
  closeCode: number | null = null;
  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
    socket.on('close', (code) => {
      this.closeCode = code;
    });
  }
  static async connect(port: number): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const client = new Client(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    await client.until(() => client.messages.some((message) => message.type === 'hello'));
    return client;
  }
  send(message: object): void {
    this.socket.send(JSON.stringify(message));
  }
  of<Type extends ServerMessage['type']>(type: Type): Extract<ServerMessage, { type: Type }>[] {
    return this.messages.filter((message): message is Extract<ServerMessage, { type: Type }> => message.type === type);
  }
  async until(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error('Não aconteceu a tempo.');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  close(): void {
    this.socket.close();
  }
}

describe('saguão pela rede', () => {
  let server: GameServer;
  let port: number;
  const clients: Client[] = [];
  const connect = async () => {
    const client = await Client.connect(port);
    clients.push(client);
    return client;
  };

  beforeEach(async () => {
    server = new GameServer({ port: 0, scheduler: new ManualScheduler(), messageBurst: 200, messagesPerSecond: 200 });
    ({ port } = await server.start());
  });
  afterEach(async () => {
    clients.splice(0).forEach((client) => client.close());
    await server.stop();
  });

  it('list_rooms devolve as salas públicas e o estado da sala traz visibilidade, senha e regras', async () => {
    const ana = await connect();
    ana.send({ type: 'create_room', playerName: 'Ana', visibility: 'public', password: 'segredo', modifiers: { extraLives: 1, extraIncome: 2 } });
    await ana.until(() => ana.of('room_state').length > 0);
    expect(ana.of('room_state')[0]).toMatchObject({ visibility: 'public', hasPassword: true, modifiers: { extraLives: 1, extraIncome: 2 } });
    expect(JSON.stringify(ana.messages)).not.toContain('segredo');

    const beto = await connect();
    beto.send({ type: 'list_rooms' });
    await beto.until(() => beto.of('room_list').length > 0);
    expect(beto.of('room_list')[0]!.rooms).toEqual([expect.objectContaining({ hostName: 'Ana', hasPassword: true, playerCount: 1 })]);
  });

  it('entrar numa sala com senha errada dá erro; certa entra; e muitas erradas seguidas fecham a conexão', async () => {
    const ana = await connect();
    ana.send({ type: 'create_room', playerName: 'Ana', password: 'segredo' });
    await ana.until(() => ana.of('room_joined').length > 0);
    const code = ana.of('room_joined')[0]!.roomCode;

    const beto = await connect();
    beto.send({ type: 'join_room', roomCode: code, playerName: 'Beto', password: 'errada' });
    await beto.until(() => beto.of('error').length > 0);
    expect(beto.of('error')[0]!.code).toBe('wrong_password');
    beto.send({ type: 'join_room', roomCode: code, playerName: 'Beto', password: 'segredo' });
    await beto.until(() => beto.of('room_joined').length > 0);

    const intruso = await connect();
    for (let attempt = 0; attempt < 10; attempt++) {
      intruso.send({ type: 'join_room', roomCode: code, playerName: 'X', password: `tentativa${attempt}` });
    }
    await intruso.until(() => intruso.closeCode !== null);
    expect(intruso.closeCode).toBe(1008);
  });

  it('partida rápida cria uma sala e a segunda pessoa entra nela', async () => {
    const ana = await connect();
    ana.send({ type: 'quick_match', playerName: 'Ana' });
    await ana.until(() => ana.of('room_joined').length > 0);
    const beto = await connect();
    beto.send({ type: 'quick_match', playerName: 'Beto' });
    await beto.until(() => beto.of('room_joined').length > 0);
    expect(beto.of('room_joined')[0]!.roomCode).toBe(ana.of('room_joined')[0]!.roomCode);
  });

  it('as regras da sala chegam ao início da partida e valem nela (vidas e tempo de preparação)', async () => {
    const ana = await connect();
    ana.send({ type: 'create_room', playerName: 'Ana', modifiers: { extraLives: 2, extraPreparationSeconds: 20, extraIncome: 3 } });
    await ana.until(() => ana.of('room_joined').length > 0);
    ana.send({ type: 'start_match' });
    await ana.until(() => ana.of('match_started').length > 0 && ana.of('round_started').length > 0 && ana.of('player_view').length > 0);
    expect(ana.of('match_started')[0]!.modifiers).toMatchObject({ extraLives: 2, extraPreparationSeconds: 20, extraIncome: 3 });
    expect(ana.of('match_started')[0]!.players[0]!.lives).toBe(5);
    expect(ana.of('round_started')[0]!.preparationSeconds).toBe(60);
    expect(ana.of('player_view')[0]!.view.coins).toBe(8);
  });
});
