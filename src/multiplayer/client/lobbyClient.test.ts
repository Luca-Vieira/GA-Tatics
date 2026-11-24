import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameServer } from '../host/GameServer';
import { ManualScheduler } from '../host/scheduler';
import { LobbyClient } from './LobbyClient';
import type { RemoteMatchSession } from './RemoteMatchSession';
import { ServerConnection } from './ServerConnection';

async function eventually(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Não aconteceu a tempo: ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('saguão do cliente (salas, senha, partida rápida e regras)', () => {
  let server: GameServer;
  let port: number;
  const connections: ServerConnection[] = [];

  async function newClient(): Promise<LobbyClient> {
    const connection = await ServerConnection.connect(`ws://127.0.0.1:${port}`);
    connections.push(connection);
    return new LobbyClient(connection);
  }

  async function listRooms(client: LobbyClient) {
    let arrived = false;
    const stop = client.onRoomList(() => {
      arrived = true;
    });
    client.refreshRooms();
    await eventually(() => arrived, 'lista de salas');
    stop();
    return client.rooms;
  }

  beforeEach(async () => {
    server = new GameServer({ port: 0, scheduler: new ManualScheduler(), messageBurst: 200, messagesPerSecond: 200 });
    ({ port } = await server.start());
  });
  afterEach(async () => {
    connections.splice(0).forEach((connection) => connection.close());
    await server.stop();
  });

  it('a lista mostra as salas públicas (e não as privadas), com cadeado e regras', async () => {
    const ana = await newClient();
    ana.createRoom('Ana', { visibility: 'public', password: 'segredo', modifiers: { extraLives: 1 } });
    await eventually(() => ana.isInRoom, 'sala da Ana');
    const beto = await newClient();
    beto.createRoom('Beto', { visibility: 'private' });
    await eventually(() => beto.isInRoom, 'sala do Beto');

    const caio = await newClient();
    const rooms = await listRooms(caio);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ hostName: 'Ana', hasPassword: true, modifiers: { extraLives: 1 } });
    expect(ana.state).toMatchObject({ visibility: 'public', hasPassword: true, modifiers: { extraLives: 1 } });
    expect(beto.state.visibility).toBe('private');
  });

  it('entrar com senha errada mostra a mensagem em português; com a certa, entra', async () => {
    const ana = await newClient();
    ana.createRoom('Ana', { password: 'segredo' });
    await eventually(() => ana.isInRoom, 'sala');
    const code = ana.state.roomCode!;

    const beto = await newClient();
    const errors: string[] = [];
    beto.onError((message) => errors.push(message));
    beto.joinRoom(code, 'Beto', 'errada');
    await eventually(() => errors.length > 0, 'erro de senha');
    expect(errors[0]).toBe('Senha da sala incorreta.');
    expect(beto.isInRoom).toBe(false);
    beto.joinRoom(code, 'Beto', 'segredo');
    await eventually(() => beto.isInRoom, 'entrada com senha');
  });

  it('partida rápida: a primeira pessoa cria, a segunda entra na mesma sala', async () => {
    const ana = await newClient();
    ana.quickMatch('Ana');
    await eventually(() => ana.isInRoom, 'sala da partida rápida');
    const beto = await newClient();
    beto.quickMatch('Beto');
    await eventually(() => beto.isInRoom, 'entrada da partida rápida');
    expect(beto.state.roomCode).toBe(ana.state.roomCode);
  });

  it('as regras da sala valem na partida: vidas, tempo e texto para a interface', async () => {
    const ana = await newClient();
    let session: RemoteMatchSession | null = null;
    ana.onMatchStarted((started) => (session = started));
    ana.createRoom('Ana', { modifiers: { extraLives: 2, extraPreparationSeconds: 10, extraIncome: 1 } });
    await eventually(() => ana.isInRoom, 'sala');
    ana.startMatch();
    await eventually(() => session !== null, 'partida');
    const started = session as unknown as RemoteMatchSession;
    expect(started.match.config.rounds.startingLives).toBe(5);
    expect(started.match.config.rounds.preparationSeconds).toBe(50);
    expect(started.match.config.economy.incomeByRound[0]).toBe(6);
    expect(started.match.getPlayer(started.humanId).lives).toBe(5);
    expect(started.roomRules).toEqual(['+2 vidas', '+10s de preparação', '+1 de moedas por rodada']);
  });
});
