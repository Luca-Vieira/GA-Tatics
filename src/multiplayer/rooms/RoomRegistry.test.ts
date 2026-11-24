import { describe, expect, it } from 'vitest';
import { ManualScheduler } from '../host/scheduler';
import type { ServerMessage } from '../protocol/serverMessages';
import { RoomRegistry } from './RoomRegistry';

function createRegistry(maximumRooms = 4) {
  const scheduler = new ManualScheduler();
  const inbox = new Map<string, ServerMessage[]>();
  let nextCode = 0;
  const registry = new RoomRegistry({
    maximumRooms,
    createRoomCode: () => `AAA${String.fromCharCode(65 + nextCode++)}`,
    dependencies: {
      scheduler,
      createMatchSeed: () => 'semente-de-teste',
      send: (connectionId, message) => {
        inbox.set(connectionId, [...(inbox.get(connectionId) ?? []), message]);
      },
    },
  });
  const messagesOf = (connectionId: string) => inbox.get(connectionId) ?? [];
  const lastRoomState = (connectionId: string) => messagesOf(connectionId).filter((message) => message.type === 'room_state').at(-1);
  return { registry, scheduler, messagesOf, lastRoomState };
}

describe('salas', () => {
  it('quem cria a sala entra nela como anfitrião e recebe o código e o lugar', () => {
    const { registry, messagesOf, lastRoomState } = createRegistry();
    const created = registry.createRoom('c1', 'Ana');
    expect(created).toMatchObject({ ok: true });
    expect(messagesOf('c1')[0]).toEqual({ type: 'room_joined', roomCode: 'AAAA', playerId: 'p1' });
    expect(lastRoomState('c1')).toMatchObject({ status: 'lobby', members: [{ playerId: 'p1', name: 'Ana', isHost: true, connected: true }] });
  });

  it('outros jogadores entram pelo código e todos veem a lista atualizada', () => {
    const { registry, lastRoomState } = createRegistry();
    registry.createRoom('c1', 'Ana');
    expect(registry.joinRoom('c2', 'AAAA', 'Beto')).toMatchObject({ ok: true });
    const state = lastRoomState('c1');
    expect(state).toMatchObject({ members: [{ name: 'Ana', isHost: true }, { name: 'Beto', isHost: false, playerId: 'p2' }] });
    expect(lastRoomState('c2')).toEqual(state);
  });

  it('recusa código inexistente, sala cheia e quem já está numa sala', () => {
    const { registry } = createRegistry();
    registry.createRoom('c1', 'Ana');
    expect(registry.joinRoom('c9', 'ZZZZ', 'Fulano')).toEqual({ ok: false, code: 'room_not_found' });
    expect(registry.joinRoom('c1', 'AAAA', 'Ana de novo')).toEqual({ ok: false, code: 'already_in_room' });
    expect(registry.createRoom('c1', 'Ana')).toEqual({ ok: false, code: 'already_in_room' });
    registry.joinRoom('c2', 'AAAA', 'B');
    registry.joinRoom('c3', 'AAAA', 'C');
    registry.joinRoom('c4', 'AAAA', 'D');
    expect(registry.joinRoom('c5', 'AAAA', 'E')).toEqual({ ok: false, code: 'room_full' });
  });

  it('limita o número de salas abertas', () => {
    const { registry } = createRegistry(2);
    registry.createRoom('c1', 'A');
    registry.createRoom('c2', 'B');
    expect(registry.createRoom('c3', 'C')).toEqual({ ok: false, code: 'server_full' });
    expect(registry.roomCount).toBe(2);
  });

  it('quando o anfitrião sai, o próximo vira anfitrião; sala vazia some', () => {
    const { registry, lastRoomState } = createRegistry();
    registry.createRoom('c1', 'Ana');
    registry.joinRoom('c2', 'AAAA', 'Beto');
    registry.leave('c1');
    expect(lastRoomState('c2')).toMatchObject({ members: [{ name: 'Beto', isHost: true }] });
    registry.leave('c2');
    expect(registry.roomCount).toBe(0);
    expect(registry.joinRoom('c3', 'AAAA', 'Carla')).toEqual({ ok: false, code: 'room_not_found' });
  });

  it('a vaga liberada no saguão é reaproveitada', () => {
    const { registry, messagesOf } = createRegistry();
    registry.createRoom('c1', 'Ana');
    registry.joinRoom('c2', 'AAAA', 'Beto');
    registry.joinRoom('c3', 'AAAA', 'Carla');
    registry.leave('c2');
    registry.joinRoom('c4', 'AAAA', 'Dani');
    expect(messagesOf('c4')[0]).toMatchObject({ type: 'room_joined', playerId: 'p2' });
  });
});

describe('partida a partir da sala', () => {
  it('só o anfitrião inicia; as vagas livres viram bots; os humanos recebem o início', () => {
    const { registry, messagesOf } = createRegistry();
    registry.createRoom('c1', 'Ana');
    const room = registry.joinRoom('c2', 'AAAA', 'Beto');
    if (!room.ok) throw new Error('sala não encontrada');
    expect(room.value.startMatch('c2')).toEqual({ ok: false, code: 'not_host' });
    expect(room.value.startMatch('c1')).toMatchObject({ ok: true });
    const started = messagesOf('c1').find((message) => message.type === 'match_started');
    expect(started).toMatchObject({ type: 'match_started', players: [{ name: 'Ana', isBot: false }, { name: 'Beto', isBot: false }, { name: 'Bot 1', isBot: true }, { name: 'Bot 2', isBot: true }] });
    expect(messagesOf('c2').some((message) => message.type === 'round_started')).toBe(true);
  });

  it('não aceita entrada nem segundo início com a partida em andamento', () => {
    const { registry } = createRegistry();
    const created = registry.createRoom('c1', 'Ana');
    if (!created.ok) throw new Error('falha ao criar');
    created.value.startMatch('c1');
    expect(registry.joinRoom('c2', 'AAAA', 'Beto')).toEqual({ ok: false, code: 'match_in_progress' });
    expect(created.value.startMatch('c1')).toEqual({ ok: false, code: 'match_in_progress' });
  });

  it('as ações só funcionam com partida em andamento', () => {
    const { registry } = createRegistry();
    const created = registry.createRoom('c1', 'Ana');
    if (!created.ok) throw new Error('falha ao criar');
    expect(created.value.handleGameAction('c1', { type: 'refresh_shop' })).toEqual({ ok: false, code: 'no_match_running' });
  });

  it('quando a partida acaba, a sala volta ao saguão e os desconectados saem da lista', () => {
    const { registry, scheduler, lastRoomState } = createRegistry();
    const created = registry.createRoom('c1', 'Ana');
    registry.joinRoom('c2', 'AAAA', 'Beto');
    if (!created.ok) throw new Error('falha ao criar');
    created.value.startMatch('c1');
    registry.leave('c2');
    expect(lastRoomState('c1')).toMatchObject({ status: 'playing', members: [{ name: 'Ana' }, { name: 'Beto', connected: false }] });
    scheduler.advance(30 * 60 * 1000);
    expect(lastRoomState('c1')).toMatchObject({ status: 'lobby', members: [{ name: 'Ana', isHost: true, connected: true }] });
  });

  it('se todos saem durante a partida, a sala é fechada e os cronômetros param', () => {
    const { registry, scheduler } = createRegistry();
    const created = registry.createRoom('c1', 'Ana');
    if (!created.ok) throw new Error('falha ao criar');
    created.value.startMatch('c1');
    registry.leave('c1');
    expect(registry.roomCount).toBe(0);
    expect(scheduler.pendingCount).toBe(0);
  });
});
