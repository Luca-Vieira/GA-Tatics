import type { ServerErrorCode } from '../protocol/serverMessages';
import type { RoomSummaryView } from '../protocol/serverMessages';
import { NO_ROOM_MODIFIERS } from '@data/schemas/roomModifiers';
import { DEFAULT_ROOM_SETTINGS, Room, type RoomDependencies, type RoomResult, type RoomSettings } from './Room';
import { generateRoomCode } from './roomCode';
import { DEFAULT_PLAYERS_PER_ROOM } from '../protocol/clientMessages';
import type { LiveActivity } from '../host/liveActivities';

export interface RoomRegistryOptions {
  readonly dependencies: RoomDependencies;
  readonly maximumRooms: number;
  /** Sorteia o código da sala; injetável para os testes. */
  readonly createRoomCode?: () => string;
}

/** Quantas salas a lista pública mostra (as mais antigas primeiro). */
const MAXIMUM_LISTED_ROOMS = 50;

export const ROOM_ABANDONED_NOTICE = 'Os jogadores saíram e a sala foi encerrada.';
export const ENDED_BY_ADMIN_NOTICE = 'A sala foi encerrada pelo administrador do servidor.';

/** Guarda as salas abertas e sabe em qual delas cada conexão está. */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly roomCodeByConnection = new Map<string, string>();
  private readonly options: RoomRegistryOptions;

  constructor(options: RoomRegistryOptions) {
    this.options = options;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Sala em que a conexão está (jogando, esperando ou assistindo). */
  roomOf(connectionId: string): Room | null {
    const code = this.roomCodeByConnection.get(connectionId);
    if (!code) {
      return null;
    }
    const room = this.rooms.get(code);
    // A sala pode ter acabado ou, ao fim da partida, ter dispensado quem assistia.
    if (!room?.includes(connectionId)) {
      this.roomCodeByConnection.delete(connectionId);
      return null;
    }
    return room;
  }

  createRoom(connectionId: string, playerName: string, settings: RoomSettings = DEFAULT_ROOM_SETTINGS): RoomResult<Room> {
    if (this.roomOf(connectionId)) {
      return failure('already_in_room');
    }
    if (this.rooms.size >= this.options.maximumRooms) {
      return failure('server_full');
    }
    const room = new Room(this.createUniqueCode(), this.options.dependencies, settings);
    this.rooms.set(room.code, room);
    return this.enter(room, connectionId, playerName);
  }

  joinRoom(connectionId: string, roomCode: string, playerName: string, password?: string): RoomResult<Room> {
    if (this.roomOf(connectionId)) {
      return failure('already_in_room');
    }
    const found = this.findRoom(roomCode, password);
    return found.ok ? this.enter(found.value, connectionId, playerName) : found;
  }

  /** Entra numa partida em andamento só para assistir. */
  spectate(connectionId: string, roomCode: string, password?: string): RoomResult<Room> {
    if (this.roomOf(connectionId)) {
      return failure('already_in_room');
    }
    const found = this.findRoom(roomCode, password);
    if (!found.ok) {
      return found;
    }
    const added = found.value.addSpectator(connectionId);
    if (!added.ok) {
      return added;
    }
    this.roomCodeByConnection.set(connectionId, found.value.code);
    return found;
  }

  /** Tudo o que está em andamento (salas privadas inclusive), para o painel de administração. */
  listActivities(): LiveActivity[] {
    return [...this.rooms.values()].map((room) => room.activity());
  }

  /** Encerra a sala à força, avisando quem está nela. Devolve falso se ela não existir. */
  endRoom(roomCode: string, notice: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return false;
    }
    room.close(notice);
    this.rooms.delete(roomCode);
    return true;
  }

  /** Salas públicas (as privadas nunca aparecem), da mais antiga para a mais nova. */
  listPublicRooms(): RoomSummaryView[] {
    return [...this.rooms.values()]
      .filter((room) => room.visibility === 'public')
      .slice(0, MAXIMUM_LISTED_ROOMS)
      .map((room) => room.summary());
  }

  /**
   * Partida rápida: entra numa sala pública aberta e sem senha (de preferência sem regras especiais); se não houver,
   * cria uma sala pública nova com as regras normais.
   */
  quickMatch(connectionId: string, playerName: string): RoomResult<Room> {
    if (this.roomOf(connectionId)) {
      return failure('already_in_room');
    }
    const candidates = [...this.rooms.values()].filter((room) => room.visibility === 'public' && !room.hasPassword && room.isOpenForPlayers);
    const hasNormalRules = (room: Room) => JSON.stringify(room.modifiers) === JSON.stringify(NO_ROOM_MODIFIERS);
    const hasUsualSize = (room: Room) => room.maximumPlayers === DEFAULT_PLAYERS_PER_ROOM;
    const target = candidates.find((room) => hasNormalRules(room) && hasUsualSize(room)) ?? candidates.find(hasNormalRules) ?? candidates[0];
    return target ? this.enter(target, connectionId, playerName) : this.createRoom(connectionId, playerName);
  }

  leave(connectionId: string): void {
    const room = this.roomOf(connectionId);
    if (!room) {
      return;
    }
    this.roomCodeByConnection.delete(connectionId);
    room.leave(connectionId);
    if (!room.hasConnectedMembers) {
      room.close(ROOM_ABANDONED_NOTICE);
      this.rooms.delete(room.code);
    }
  }

  closeAll(): void {
    this.rooms.forEach((room) => room.close());
    this.rooms.clear();
    this.roomCodeByConnection.clear();
  }

  private enter(room: Room, connectionId: string, playerName: string): RoomResult<Room> {
    const joined = room.join(connectionId, playerName);
    if (!joined.ok) {
      if (room.isEmpty) {
        this.rooms.delete(room.code);
      }
      return joined;
    }
    this.roomCodeByConnection.set(connectionId, room.code);
    return { ok: true, value: room };
  }

  private findRoom(roomCode: string, password: string | undefined): RoomResult<Room> {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return failure('room_not_found');
    }
    // A senha é conferida antes de tudo: quem erra não descobre se a sala está cheia ou em partida.
    return room.acceptsPassword(password) ? { ok: true, value: room } : failure('wrong_password');
  }

  private createUniqueCode(): string {
    const createCode = this.options.createRoomCode ?? generateRoomCode;
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = createCode();
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    throw new Error('Não foi possível sortear um código de sala livre.');
  }
}

function failure(code: ServerErrorCode): RoomResult<never> {
  return { ok: false, code };
}
