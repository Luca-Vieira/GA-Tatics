import type { ServerErrorCode } from '../protocol/serverMessages';
import { Room, type RoomDependencies, type RoomResult } from './Room';
import { generateRoomCode } from './roomCode';

export interface RoomRegistryOptions {
  readonly dependencies: RoomDependencies;
  readonly maximumRooms: number;
  /** Sorteia o código da sala; injetável para os testes. */
  readonly createRoomCode?: () => string;
}

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

  roomOf(connectionId: string): Room | null {
    const code = this.roomCodeByConnection.get(connectionId);
    return code ? (this.rooms.get(code) ?? null) : null;
  }

  createRoom(connectionId: string, playerName: string): RoomResult<Room> {
    if (this.roomCodeByConnection.has(connectionId)) {
      return failure('already_in_room');
    }
    if (this.rooms.size >= this.options.maximumRooms) {
      return failure('server_full');
    }
    const room = new Room(this.createUniqueCode(), this.options.dependencies);
    this.rooms.set(room.code, room);
    return this.enter(room, connectionId, playerName);
  }

  joinRoom(connectionId: string, roomCode: string, playerName: string): RoomResult<Room> {
    if (this.roomCodeByConnection.has(connectionId)) {
      return failure('already_in_room');
    }
    const room = this.rooms.get(roomCode);
    return room ? this.enter(room, connectionId, playerName) : failure('room_not_found');
  }

  leave(connectionId: string): void {
    const room = this.roomOf(connectionId);
    if (!room) {
      return;
    }
    this.roomCodeByConnection.delete(connectionId);
    room.leave(connectionId);
    if (room.isEmpty || !room.hasConnectedMembers) {
      room.close();
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
