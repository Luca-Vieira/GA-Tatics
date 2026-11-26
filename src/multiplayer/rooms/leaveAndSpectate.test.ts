import { describe, expect, it } from 'vitest';
import { DEFAULT_COMBAT_TIME_LIMIT_MS } from '@combat/engine/constants';
import { NO_ROOM_MODIFIERS } from '@data/schemas/roomModifiers';
import { ManualScheduler } from '../host/scheduler';
import { parseClientMessage } from '../protocol/clientMessages';
import type { ServerMessage } from '../protocol/serverMessages';
import { MAXIMUM_SPECTATORS_PER_ROOM, type Room, type RoomSettings } from './Room';
import { ENDED_BY_ADMIN_NOTICE, ROOM_ABANDONED_NOTICE, RoomRegistry } from './RoomRegistry';

const PREPARATION_MS = 40_000;
const LONGEST_COMBAT_MS = DEFAULT_COMBAT_TIME_LIMIT_MS + 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function createRegistry() {
  const scheduler = new ManualScheduler();
  const inbox = new Map<string, ServerMessage[]>();
  let nextCode = 0;
  const registry = new RoomRegistry({
    maximumRooms: 8,
    createRoomCode: () => `AAA${String.fromCharCode(65 + nextCode++)}`,
    dependencies: {
      scheduler,
      createMatchSeed: () => 'semente-de-teste',
      send: (connectionId, message) => inbox.set(connectionId, [...(inbox.get(connectionId) ?? []), message]),
    },
  });
  const messagesOf = (connectionId: string) => inbox.get(connectionId) ?? [];
  function of<Type extends ServerMessage['type']>(connectionId: string, type: Type): Extract<ServerMessage, { type: Type }>[] {
    return messagesOf(connectionId).filter((message): message is Extract<ServerMessage, { type: Type }> => message.type === type);
  }
  return { registry, scheduler, messagesOf, of };
}

function settings(overrides: Partial<RoomSettings> = {}): RoomSettings {
  return { visibility: 'public', modifiers: NO_ROOM_MODIFIERS, ...overrides };
}

/** Sala já em partida, com as pessoas dadas (a primeira é a anfitriã). */
function startedRoom(registry: RoomRegistry, connectionIds: readonly string[], roomSettings = settings()): Room {
  const [hostId, ...guestIds] = connectionIds;
  const created = registry.createRoom(hostId!, hostId!, roomSettings);
  if (!created.ok) throw new Error(`falha ao criar: ${created.code}`);
  guestIds.forEach((guestId) => registry.joinRoom(guestId, created.value.code, guestId));
  created.value.startMatch(hostId!);
  return created.value;
}

describe('salas com quantidade variável de jogadores', () => {
  it('sala de 2: o terceiro não entra e a partida tem só as duas pessoas', () => {
    const { registry, of } = createRegistry();
    registry.createRoom('c1', 'Ana', settings({ maximumPlayers: 2 }));
    registry.joinRoom('c2', 'AAAA', 'Beto');
    expect(registry.joinRoom('c3', 'AAAA', 'Carla')).toEqual({ ok: false, code: 'room_full' });
    expect(registry.listPublicRooms()[0]).toMatchObject({ playerCount: 2, maximumPlayers: 2 });
    expect(of('c1', 'room_state').at(-1)).toMatchObject({ maximumPlayers: 2 });

    registry.roomOf('c1')!.startMatch('c1');
    expect(of('c1', 'match_started')[0]!.players.map((player) => player.isBot)).toEqual([false, false]);
  });

  it('sala de 8: os bots completam as vagas e a partida vai até a colocação dos oito', () => {
    const { registry, scheduler, of } = createRegistry();
    startedRoom(registry, ['c1'], settings({ maximumPlayers: 8 }));
    const players = of('c1', 'match_started')[0]!.players;
    expect(players).toHaveLength(8);
    expect(players.filter((player) => player.isBot)).toHaveLength(7);
    scheduler.advance(THIRTY_MINUTES_MS);
    expect(of('c1', 'match_ended')[0]!.standings).toHaveLength(8);
  });

  it('um lugar vago no meio (alguém saiu do saguão) não repete o id de ninguém', () => {
    const { registry, of } = createRegistry();
    registry.createRoom('c1', 'Ana');
    registry.joinRoom('c2', 'AAAA', 'Beto');
    registry.leave('c1');
    registry.roomOf('c2')!.startMatch('c2');
    const ids = of('c2', 'match_started')[0]!.players.map((player) => player.playerId);
    expect(new Set(ids).size).toBe(4);
  });

  it('o protocolo aceita de 2 a 8 jogadores', () => {
    const parse = (maximumPlayers: number) => parseClientMessage(JSON.stringify({ type: 'create_room', playerName: 'Ana', maximumPlayers })).ok;
    expect([1, 2, 8, 9].map(parse)).toEqual([false, true, true, false]);
  });

  it('a partida rápida prefere a sala do tamanho de sempre', () => {
    const { registry, of } = createRegistry();
    registry.createRoom('c1', 'Ana', settings({ maximumPlayers: 8 }));
    registry.createRoom('c2', 'Beto');
    registry.quickMatch('c3', 'Carla');
    expect(of('c3', 'room_joined')[0]).toMatchObject({ roomCode: 'AAAB' });
  });
});

describe('sair da partida em andamento', () => {
  it('o anfitrião sai na preparação: um bot assume a vaga, o outro segue jogando e quem saiu não recebe mais nada', () => {
    const { registry, scheduler, messagesOf, of } = createRegistry();
    startedRoom(registry, ['c1', 'c2']);
    registry.leave('c1');
    const received = messagesOf('c1').length;

    expect(of('c2', 'players_updated')[0]!.players[0]).toMatchObject({ playerId: 'p1', isBot: true });
    expect(of('c2', 'room_state').at(-1)).toMatchObject({ members: [{ playerId: 'p1', connected: false }, { playerId: 'p2', isHost: true }] });
    scheduler.advance(PREPARATION_MS + LONGEST_COMBAT_MS + 5000);
    expect(of('c2', 'round_started').map((message) => message.round)).toEqual([1, 2]);
    expect(messagesOf('c1')).toHaveLength(received);
  });

  it('sair no meio do combate não muda o duelo em andamento e a partida termina normalmente', () => {
    const { registry, scheduler, of } = createRegistry();
    startedRoom(registry, ['c1', 'c2']);
    scheduler.advance(PREPARATION_MS);
    expect(of('c2', 'combat_started')).toHaveLength(1);
    registry.leave('c1');
    scheduler.advance(LONGEST_COMBAT_MS);
    expect(of('c2', 'round_result')[0]!.players[0]).toMatchObject({ playerId: 'p1', isBot: true });
    scheduler.advance(THIRTY_MINUTES_MS);
    expect(of('c2', 'match_ended')).toHaveLength(1);
    expect(registry.listActivities()[0]).toMatchObject({ status: 'lobby', playerNames: ['c2'], round: null });
  });

  it('quando todas as pessoas saem, a sala some, os cronômetros param e quem assistia é avisado', () => {
    const { registry, scheduler, of } = createRegistry();
    startedRoom(registry, ['c1', 'c2']);
    registry.spectate('c9', 'AAAA');
    registry.leave('c1');
    registry.leave('c2');
    expect(registry.roomCount).toBe(0);
    expect(scheduler.pendingCount).toBe(0);
    expect(of('c9', 'room_closed')).toEqual([{ type: 'room_closed', notice: ROOM_ABANDONED_NOTICE }]);
    expect(registry.createRoom('c9', 'Visitante')).toMatchObject({ ok: true });
  });
});

describe('quem assiste', () => {
  it('durante a preparação não recebe loja, moedas, unidades nem o próximo adversário', () => {
    const { registry, scheduler, messagesOf, of } = createRegistry();
    startedRoom(registry, ['c1']);
    expect(registry.spectate('c9', 'AAAA')).toMatchObject({ ok: true });
    registry.roomOf('c1')!.handleGameAction('c1', { type: 'buy', shopSlot: 0 });

    expect(of('c9', 'spectate_started')[0]).toMatchObject({ watchedPlayerId: 'p1', roomCode: 'AAAA' });
    expect(of('c9', 'round_started')[0]).toMatchObject({ round: 1, opponentId: null });
    expect(of('c9', 'player_view')).toHaveLength(0);
    expect(of('c9', 'action_result')).toHaveLength(0);
    expect(JSON.stringify(messagesOf('c9'))).not.toContain('p1-u');
    scheduler.advance(PREPARATION_MS);
    expect(of('c9', 'combat_started')[0]!.duel).not.toBeNull();
    expect(of('c9', 'combat_started')[0]!.elapsedMs).toBeUndefined();
  });

  it('entrando no meio do combate, recebe o duelo e quanto já passou', () => {
    const { registry, scheduler, of } = createRegistry();
    startedRoom(registry, ['c1']);
    scheduler.advance(PREPARATION_MS);
    scheduler.advance(2000);
    registry.spectate('c9', 'AAAA');
    const combat = of('c9', 'combat_started')[0]!;
    expect(combat.elapsedMs).toBe(2000);
    expect([combat.duel!.topId, combat.duel!.bottomId]).toContain('p1');
  });

  it('nenhuma ação de quem assiste chega à partida', () => {
    const { registry, of } = createRegistry();
    const room = startedRoom(registry, ['c1']);
    registry.spectate('c9', 'AAAA');
    const viewsBefore = of('c1', 'player_view').length;
    const rejected = { ok: false, code: 'spectator_cannot_act' };
    expect(room.handleGameAction('c9', { type: 'buy', shopSlot: 0 })).toEqual(rejected);
    expect(room.handleGameAction('c9', { type: 'set_ready', ready: true })).toEqual(rejected);
    expect(room.handleGameAction('c9', { type: 'refresh_shop' })).toEqual(rejected);
    expect(room.startMatch('c9')).toEqual(rejected);
    expect(of('c1', 'player_view')).toHaveLength(viewsBefore);
    expect(registry.joinRoom('c9', 'AAAA', 'Intruso')).toEqual({ ok: false, code: 'already_in_room' });
  });

  it('pede a senha, só vale para partida em andamento, tem limite e não ocupa vaga', () => {
    const { registry } = createRegistry();
    registry.createRoom('c1', 'Ana', settings({ password: 'segredo', visibility: 'private' }));
    expect(registry.spectate('v0', 'AAAA', 'segredo')).toEqual({ ok: false, code: 'no_match_running' });
    registry.roomOf('c1')!.startMatch('c1');
    expect(registry.spectate('v0', 'AAAA')).toEqual({ ok: false, code: 'wrong_password' });
    expect(registry.spectate('v0', 'AAAA', 'errada')).toEqual({ ok: false, code: 'wrong_password' });
    for (let index = 0; index < MAXIMUM_SPECTATORS_PER_ROOM; index++) {
      expect(registry.spectate(`v${index}`, 'AAAA', 'segredo')).toMatchObject({ ok: true });
    }
    expect(registry.spectate('extra', 'AAAA', 'segredo')).toEqual({ ok: false, code: 'spectators_full' });
    expect(registry.listActivities()[0]).toMatchObject({ spectatorCount: MAXIMUM_SPECTATORS_PER_ROOM, playerNames: ['Ana'] });

    registry.leave('v0');
    expect(registry.spectate('extra', 'AAAA', 'segredo')).toMatchObject({ ok: true });
  });

  it('troca de quem acompanha; jogador inexistente e quem joga são recusados', () => {
    const { registry, scheduler, of } = createRegistry();
    const room = startedRoom(registry, ['c1']);
    registry.spectate('c9', 'AAAA');
    scheduler.advance(PREPARATION_MS);
    expect(room.watchPlayer('c9', 'p3')).toMatchObject({ ok: true });
    expect(of('c9', 'watching')).toEqual([{ type: 'watching', playerId: 'p3' }]);
    const duel = of('c9', 'combat_started').at(-1)!.duel;
    expect(duel === null || [duel.topId, duel.bottomId].includes('p3')).toBe(true);
    expect(room.watchPlayer('c9', 'p99')).toEqual({ ok: false, code: 'unknown_player' });
    expect(room.watchPlayer('c1', 'p2')).toEqual({ ok: false, code: 'not_spectating' });
  });

  it('quando a partida acaba, recebe a colocação e fica livre para entrar em outra sala', () => {
    const { registry, scheduler, of } = createRegistry();
    startedRoom(registry, ['c1']);
    registry.spectate('c9', 'AAAA');
    scheduler.advance(THIRTY_MINUTES_MS);
    expect(of('c9', 'match_ended')).toHaveLength(1);
    expect(registry.roomOf('c9')).toBeNull();
    expect(registry.joinRoom('c9', 'AAAA', 'Agora jogo')).toMatchObject({ ok: true });
  });
});

describe('encerramento pelo administrador', () => {
  it('encerra uma sala em jogo, avisa quem joga e quem assiste e para os cronômetros', () => {
    const { registry, scheduler, of } = createRegistry();
    startedRoom(registry, ['c1', 'c2']);
    registry.spectate('c9', 'AAAA');
    expect(registry.listActivities()).toEqual([{ roomCode: 'AAAA', status: 'playing', playerNames: ['c1', 'c2'], spectatorCount: 1, round: 1 }]);

    expect(registry.endRoom('ZZZZ', ENDED_BY_ADMIN_NOTICE)).toBe(false);
    expect(registry.endRoom('AAAA', ENDED_BY_ADMIN_NOTICE)).toBe(true);

    for (const connectionId of ['c1', 'c2', 'c9']) {
      expect(of(connectionId, 'room_closed')).toEqual([{ type: 'room_closed', notice: ENDED_BY_ADMIN_NOTICE }]);
      expect(registry.roomOf(connectionId)).toBeNull();
    }
    expect(registry.roomCount).toBe(0);
    expect(scheduler.pendingCount).toBe(0);
    expect(registry.createRoom('c1', 'Ana')).toMatchObject({ ok: true });
  });
});
