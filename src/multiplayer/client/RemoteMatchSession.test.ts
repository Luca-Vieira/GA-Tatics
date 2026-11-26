import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import type { HumanDuel, RoundResultSummary, SessionListener } from '@core/game/MatchSession';
import { buildEndScreen, buildRoundResultScreen, buildShopModel, buildTopBarModel } from '@rendering/viewModels/viewModels';
import { GameServer } from '../host/GameServer';
import { ManualScheduler } from '../host/scheduler';
import { PROTOCOL_VERSION } from '../protocol/serverMessages';
import { DEFAULT_COMBAT_TIME_LIMIT_MS } from '@combat/engine/constants';
import { LobbyClient } from './LobbyClient';
import type { RemoteMatchSession } from './RemoteMatchSession';
import { ServerConnection, type SocketLike } from './ServerConnection';

/** Espera até a condição valer (as mensagens chegam pela rede de verdade, então é preciso dar tempo ao laço de eventos). */
async function eventually(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Não aconteceu a tempo: ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function recordEvents(session: RemoteMatchSession) {
  const events: string[] = [];
  const duels: (HumanDuel | null)[] = [];
  const summaries: RoundResultSummary[] = [];
  const failures: string[] = [];
  const listener: SessionListener = {
    preparationStarted: () => events.push('preparation'),
    combatStarted: (duel) => {
      events.push('combat');
      duels.push(duel);
    },
    roundConcluded: (summary) => {
      events.push('result');
      summaries.push(summary);
    },
    matchEnded: () => events.push('ended'),
    stateChanged: () => undefined,
    actionFailed: (reason) => failures.push(reason),
    fusionHappened: () => events.push('fusion'),
    connectionLost: () => events.push('lost'),
  };
  session.setListener(listener);
  return { events, duels, summaries, failures };
}

describe('partida em rede (cliente contra servidor real)', () => {
  let server: GameServer;
  let scheduler: ManualScheduler;
  let port: number;
  const connections: ServerConnection[] = [];

  async function joinLobby(): Promise<LobbyClient> {
    const connection = await ServerConnection.connect(`ws://127.0.0.1:${port}`);
    connections.push(connection);
    return new LobbyClient(connection);
  }

  /** Cria a sala, inicia a partida e devolve a sessão do anfitrião. */
  async function startMatchAsHost(): Promise<{ host: LobbyClient; session: RemoteMatchSession }> {
    const host = await joinLobby();
    let session: RemoteMatchSession | null = null;
    host.onMatchStarted((started) => (session = started));
    host.createRoom('Ana');
    await eventually(() => host.isInRoom, 'entrar na sala');
    host.startMatch();
    await eventually(() => session !== null, 'receber o início da partida');
    return { host, session: session as unknown as RemoteMatchSession };
  }

  beforeEach(async () => {
    scheduler = new ManualScheduler();
    server = new GameServer({ port: 0, scheduler });
    ({ port } = await server.start());
  });

  afterEach(async () => {
    connections.splice(0).forEach((connection) => connection.close());
    await server.stop();
  });

  it('o saguão mostra a sala, os jogadores e quem é o anfitrião', async () => {
    const host = await joinLobby();
    host.createRoom('Ana');
    await eventually(() => host.state.members.length === 1, 'sala criada');
    expect(host.state.roomCode).toMatch(/^[A-Z]{4}$/);
    expect(host.isHost).toBe(true);

    const guest = await joinLobby();
    guest.joinRoom(host.state.roomCode!.toLowerCase(), 'Beto');
    await eventually(() => host.state.members.length === 2 && guest.state.members.length === 2, 'segundo jogador');
    expect(guest.isHost).toBe(false);
    expect(host.state.members.map((member) => member.name)).toEqual(['Ana', 'Beto']);
  });

  it('mostra uma mensagem em português quando a sala não existe', async () => {
    const client = await joinLobby();
    const errors: string[] = [];
    client.onError((message) => errors.push(message));
    client.joinRoom('ZZZZ', 'Ana');
    await eventually(() => errors.length > 0, 'resposta de erro');
    expect(errors[0]).toContain('Sala não encontrada');
  });

  it('só o anfitrião inicia; quem não é recebe o aviso', async () => {
    const host = await joinLobby();
    host.createRoom('Ana');
    await eventually(() => host.isInRoom, 'sala criada');
    const guest = await joinLobby();
    const errors: string[] = [];
    guest.onError((message) => errors.push(message));
    guest.joinRoom(host.state.roomCode!, 'Beto');
    await eventually(() => guest.isInRoom, 'entrada do convidado');
    guest.startMatch();
    await eventually(() => errors.length > 0, 'recusa');
    expect(errors[0]).toContain('anfitrião');
  });

  it('a sessão guarda o início da rodada que chega antes da cena e o reapresenta em start()', async () => {
    const { session } = await startMatchAsHost();
    await eventually(() => session.match.unitLimit > 0 && session.match.getPlayer(session.humanId).shop.length > 0, 'primeira rodada');
    const { events } = recordEvents(session);
    expect(events).toEqual([]);
    session.start();
    expect(events).toEqual(['preparation']);
    expect(session.match.round).toBe(1);
    expect(session.match.getPlayer(session.humanId).coins).toBe(5);
    expect(session.preparationRemainingMs).toBeGreaterThan(0);
    expect(session.preparationRemainingMs).toBeLessThanOrEqual(40_000);
  });

  it('compra pela rede e a interface lê a loja e a barra superior do espelho do servidor', async () => {
    const { session } = await startMatchAsHost();
    session.start();
    await eventually(() => session.match.getPlayer(session.humanId).shop.length > 0, 'loja');
    const offeredCharacterId = session.match.getPlayer(session.humanId).shop[0]!.characterId;

    session.buy(0);
    await eventually(() => session.match.getPlayer(session.humanId).units.length === 1, 'compra confirmada');
    const player = session.match.getPlayer(session.humanId);
    expect(player.units[0]?.characterId).toBe(offeredCharacterId);
    expect(player.shop[0]).toBeNull();

    const shop = buildShopModel(session.match, session.humanId);
    expect(shop.cards[0]).toBeNull();
    expect(shop.coins).toBe(player.coins);
    const topBar = buildTopBarModel(session.match, session.humanId, '40', 'Preparação');
    expect(topBar.players.map((entry) => entry.name)).toEqual(['Ana (você)', 'Bot 1', 'Bot 2', 'Bot 3']);
    expect(session.match.synergyStatusesOf(session.humanId)).toHaveLength(3);
  });

  it('congelar uma oferta pela rede aparece na loja e no modelo da interface; descongelar desfaz', async () => {
    const { session } = await startMatchAsHost();
    session.start();
    await eventually(() => session.match.getPlayer(session.humanId).shop.length > 0, 'loja');
    session.toggleFreeze(0);
    await eventually(() => session.match.getPlayer(session.humanId).shop[0]?.frozen === true, 'congelada');
    expect(buildShopModel(session.match, session.humanId).cards[0]?.isFrozen).toBe(true);
    expect(buildShopModel(session.match, session.humanId).cards[1]?.isFrozen).toBe(false);
    session.toggleFreeze(0);
    await eventually(() => session.match.getPlayer(session.humanId).shop[0]?.frozen === false, 'descongelada');
  });

  it('uma ação recusada pelo servidor chega como motivo', async () => {
    const { session } = await startMatchAsHost();
    const { failures } = recordEvents(session);
    session.start();
    session.buy(7);
    await eventually(() => failures.length > 0, 'recusa');
    expect(failures).toEqual(['unknown_shop_slot']);
  });

  it('joga a rodada inteira: combate, resultado oficial e próxima rodada vindos do servidor', async () => {
    const { session } = await startMatchAsHost();
    const { events, duels, summaries } = recordEvents(session);
    session.start();
    session.buy(0);
    await eventually(() => session.match.getPlayer(session.humanId).units.length === 1, 'compra');
    session.move(session.match.getPlayer(session.humanId).units[0]!.id, { kind: 'board', cell: { q: 0, r: 3 } });
    session.setReady(true);
    await eventually(() => session.match.getPlayer(session.humanId).ready, 'pronto');
    scheduler.advance(0);

    await eventually(() => duels.length === 1, 'combate');
    const duel = duels[0]!;
    expect(duel.combatConfig.units.length).toBeGreaterThan(0);
    expect([duel.topId, duel.bottomId]).toContain(session.humanId);

    scheduler.advance(DEFAULT_COMBAT_TIME_LIMIT_MS + 1000);
    await eventually(() => summaries.length === 1, 'resultado da rodada');
    const screen = buildRoundResultScreen(session.match, summaries[0]!, session.humanId, 5);
    expect(['Vitória!', 'Derrota', 'Empate']).toContain(screen.title);
    expect(screen.lines.join(' ')).toMatch(/Vida restante: você \d+%/);
    expect(session.match.players.every((player) => player.lives >= 0)).toBe(true);

    scheduler.advance(5_000);
    await eventually(() => events.filter((event) => event === 'preparation').length === 2, 'segunda rodada');
    expect(session.match.round).toBe(2);
  });

  it('a partida inteira termina com a colocação e volta ao saguão', async () => {
    const { host, session } = await startMatchAsHost();
    const { events } = recordEvents(session);
    session.start();
    for (let round = 0; round < 30 && !events.includes('ended'); round++) {
      const resultsBefore = events.filter((event) => event === 'result').length;
      session.setReady(true);
      await eventually(() => session.match.getPlayer(session.humanId).ready || events.includes('ended'), 'pronto');
      scheduler.advance(0);
      scheduler.advance(DEFAULT_COMBAT_TIME_LIMIT_MS + 1000);
      await eventually(() => events.filter((event) => event === 'result').length > resultsBefore, 'resultado');
      scheduler.advance(5_000);
      await eventually(() => events.filter((event) => event === 'preparation').length > round + 1 || events.includes('ended'), 'próximo passo');
    }
    expect(events).toContain('ended');
    expect(session.match.standings()).toHaveLength(4);
    expect(buildEndScreen(session.match, session.humanId).lines.join('\n')).toContain('1º');
    await eventually(() => host.state.status === 'lobby', 'volta ao saguão');
  });

  it('avisa quando a conexão cai no meio da partida', async () => {
    const { session } = await startMatchAsHost();
    const { events } = recordEvents(session);
    session.start();
    server.stop();
    await eventually(() => events.includes('lost'), 'aviso de conexão perdida');
  });
});

describe('assistir, sair e encerrar pela rede', () => {
  let server: GameServer;
  let scheduler: ManualScheduler;
  let port: number;
  const connections: ServerConnection[] = [];

  interface TestPlayer {
    readonly lobby: LobbyClient;
    readonly sessions: RemoteMatchSession[];
    readonly notices: string[];
  }

  async function connectPlayer(): Promise<TestPlayer> {
    const connection = await ServerConnection.connect(`ws://127.0.0.1:${port}`);
    connections.push(connection);
    const lobby = new LobbyClient(connection);
    const sessions: RemoteMatchSession[] = [];
    const notices: string[] = [];
    lobby.onMatchStarted((session) => sessions.push(session));
    lobby.onRoomClosed((notice) => notices.push(notice));
    return { lobby, sessions, notices };
  }

  async function hostMatch(maximumPlayers = 4): Promise<TestPlayer> {
    const host = await connectPlayer();
    host.lobby.createRoom('Ana', { maximumPlayers });
    await eventually(() => host.lobby.isInRoom, 'sala criada');
    host.lobby.startMatch();
    await eventually(() => host.sessions.length === 1, 'início');
    return host;
  }

  beforeEach(async () => {
    scheduler = new ManualScheduler();
    server = new GameServer({ port: 0, scheduler });
    ({ port } = await server.start());
  });

  afterEach(async () => {
    connections.splice(0).forEach((connection) => connection.close());
    await server.stop();
  });

  it('uma sala de 8 chega à tela com os oito jogadores', async () => {
    const host = await hostMatch(8);
    expect(host.sessions[0]!.match.players).toHaveLength(8);
    expect(host.sessions[0]!.spectator).toBeNull();
  });

  it('quem assiste vê a lista, entra, troca de jogador e não consegue agir', async () => {
    const host = await hostMatch();
    const viewer = await connectPlayer();
    viewer.lobby.refreshRooms();
    await eventually(() => viewer.lobby.rooms.length === 1, 'lista de salas');
    expect(viewer.lobby.rooms[0]).toMatchObject({ status: 'playing', canBeWatched: true, spectatorCount: 0 });

    viewer.lobby.spectate(viewer.lobby.rooms[0]!.roomCode);
    await eventually(() => viewer.sessions.length === 1, 'sessão de espectador');
    const session = viewer.sessions[0]!;
    const { events, failures } = recordEvents(session);
    await eventually(() => session.match.unitLimit > 0, 'rodada');
    session.start();
    expect(events).toEqual(['preparation']);
    expect(session.humanId).toBe(host.sessions[0]!.humanId);
    expect(session.spectator!.watchedPlayerId).toBe(session.humanId);
    expect(session.match.getPlayer(session.humanId).shop).toEqual([]);
    expect(viewer.lobby.isInRoom).toBe(false);

    session.buy(0);
    session.setReady(true);
    expect(failures).toEqual(['spectator', 'spectator']);

    const otherId = session.match.players.find((player) => player.id !== session.humanId)!.id;
    session.spectator!.watch(otherId);
    await eventually(() => session.humanId === otherId && events.length === 2, 'trocar de jogador');
    expect(session.spectator!.watchedPlayerId).toBe(otherId);

    scheduler.advance(40_000);
    await eventually(() => events.includes('combat'), 'combate');
  });

  it('quem entra no meio do combate recebe o duelo ao começar a cena, já adiantado, com o tabuleiro do acompanhado', async () => {
    // Com 4 jogadores, o duelo entre bots mantém a rodada em combate mesmo com a pessoa de tabuleiro vazio.
    await hostMatch();
    scheduler.advance(40_000);
    scheduler.advance(1_000);
    const viewer = await connectPlayer();
    viewer.lobby.refreshRooms();
    await eventually(() => viewer.lobby.rooms.length === 1, 'lista de salas');
    viewer.lobby.spectate(viewer.lobby.rooms[0]!.roomCode);
    await eventually(() => viewer.sessions.length === 1, 'sessão de espectador');
    const session = viewer.sessions[0]!;
    const { events, duels } = recordEvents(session);
    await new Promise((resolve) => setTimeout(resolve, 30));
    session.start();
    expect(events).toEqual(['preparation', 'combat']);
    expect(duels[0]!.elapsedMs).toBeGreaterThanOrEqual(1_000);
    expect(session.match.getPlayer(session.humanId).units.every((unit) => unit.location.kind === 'board')).toBe(true);
  });

  it('sair da partida limpa o saguão de quem saiu e põe um bot na vaga para quem ficou', async () => {
    const host = await connectPlayer();
    host.lobby.createRoom('Ana');
    await eventually(() => host.lobby.isInRoom, 'sala criada');
    const guest = await connectPlayer();
    guest.lobby.joinRoom(host.lobby.state.roomCode!, 'Beto');
    await eventually(() => guest.lobby.isInRoom, 'entrada');
    host.lobby.startMatch();
    await eventually(() => host.sessions.length === 1 && guest.sessions.length === 1, 'início');

    guest.sessions[0]!.leave();
    await eventually(() => host.sessions[0]!.match.getPlayer('p2').isBot, 'bot na vaga');
    expect(guest.lobby.isInRoom).toBe(false);
    guest.lobby.quickMatch('Beto');
    await eventually(() => guest.lobby.isInRoom, 'outra sala');
  });

  it('o administrador encerra a sala em jogo e todos recebem o motivo', async () => {
    const host = await hostMatch();
    const activities = server.createLiveActivities();
    expect(activities.list()[0]).toMatchObject({ status: 'playing', round: 1 });
    expect(activities.end(host.lobby.state.roomCode!.toLowerCase())).toBe(true);
    await eventually(() => host.notices.length === 1, 'aviso');
    expect(host.notices[0]).toContain('administrador');
    expect(host.lobby.isInRoom).toBe(false);
    expect(activities.list()).toEqual([]);
  });
});

const validHello = () => ({ type: 'hello', protocolVersion: PROTOCOL_VERSION, contentVersion: 1, content: DEFAULT_GAME_CONTENT });

describe('ServerConnection', () => {
  /** Soquete de mentira: o teste decide o que o "servidor" diz. */
  class FakeSocket implements SocketLike {
    readyState = 1;
    readonly sent: string[] = [];
    private readonly listeners = new Map<string, ((event: { data: unknown }) => void)[]>();

    send(data: string): void {
      this.sent.push(data);
    }
    close(): void {
      this.readyState = 3;
      this.emit('close', { data: null });
    }
    addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    emit(type: string, event: { data: unknown }): void {
      (this.listeners.get(type) ?? []).forEach((listener) => listener(event));
    }
    receive(message: object): void {
      this.emit('message', { data: JSON.stringify(message) });
    }
  }

  it('recusa um servidor com outra versão do protocolo', async () => {
    const socket = new FakeSocket();
    const pending = ServerConnection.connect('ws://teste', () => socket);
    socket.receive({ ...validHello(), protocolVersion: 99 });
    await expect(pending).rejects.toThrow('incompatível');
  });

  it('ignora lixo da rede e só entrega mensagens com tipo', async () => {
    const socket = new FakeSocket();
    const pending = ServerConnection.connect('ws://teste', () => socket);
    socket.receive(validHello());
    const connection = await pending;
    const received: string[] = [];
    connection.onMessage((message) => received.push(message.type));
    socket.emit('message', { data: 'isto não é json' });
    socket.emit('message', { data: new ArrayBuffer(4) });
    socket.receive({ nada: true });
    socket.receive({ type: 'room_closed' });
    expect(received).toEqual(['room_closed']);
  });

  it('limita o que envia, abaixo do limite do servidor, e não envia depois de fechar', async () => {
    const socket = new FakeSocket();
    const pending = ServerConnection.connect('ws://teste', () => socket, () => 0);
    socket.receive(validHello());
    const connection = await pending;
    const results = Array.from({ length: 40 }, () => connection.send({ type: 'refresh_shop' }));
    const accepted = results.filter(Boolean).length;
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(30);
    expect(socket.sent).toHaveLength(accepted);

    connection.close();
    expect(connection.send({ type: 'leave_room' })).toBe(false);
  });

  it('recusa um servidor que envia conteúdo de jogo inválido', async () => {
    const socket = new FakeSocket();
    const pending = ServerConnection.connect('ws://teste', () => socket);
    socket.receive({ ...validHello(), content: { characters: [] } });
    await expect(pending).rejects.toThrow('conteúdo de jogo inválido');
  });

  it('falha com mensagem clara quando o endereço é inválido', async () => {
    await expect(
      ServerConnection.connect('isto não é endereço', () => {
        throw new Error('endereço ruim');
      }),
    ).rejects.toThrow('Endereço de servidor inválido');
  });
});
