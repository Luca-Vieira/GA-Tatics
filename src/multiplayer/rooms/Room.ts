import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import type { CharacterDefinition } from '@data/schemas/character';
import { Game } from '@core/game/Game';
import { rotationIndexAt, synergyMappingForIndex } from '@core/synergies/rotation';
import type { ContentSnapshot } from '../host/contentStore';
import type { GameActionMessage } from '../protocol/clientMessages';
import { PLAYERS_PER_MATCH, type RoomMemberView, type RoomStatus, type ServerErrorCode, type ServerMessage } from '../protocol/serverMessages';
import { MatchController } from '../host/MatchController';
import type { Scheduler } from '../host/scheduler';

export interface RoomDependencies {
  readonly scheduler: Scheduler;
  /** Entrega uma mensagem à conexão. Conexões já fechadas são ignoradas por quem implementa. */
  readonly send: (connectionId: string, message: ServerMessage) => void;
  /** Semente da partida: precisa ser imprevisível, senão dá para adivinhar as lojas dos adversários. */
  readonly createMatchSeed: () => string;
  readonly roster?: readonly CharacterDefinition[];
  /** Conteúdo vigente do jogo; cada partida nova usa o conteúdo de quando foi criada. Sem isto, valem os padrões. */
  readonly getContent?: () => ContentSnapshot;
}

interface Member {
  readonly connectionId: string;
  readonly playerId: string;
  readonly name: string;
  connected: boolean;
}

export type RoomResult<Value = void> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly code: ServerErrorCode };

/** Sala: reúne até 4 pessoas, depois roda a partida (com bots nas vagas livres) e volta ao saguão quando ela acaba. */
export class Room {
  readonly code: string;
  private readonly dependencies: RoomDependencies;
  private readonly members: Member[] = [];
  private hostConnectionId: string | null = null;
  private status: RoomStatus = 'lobby';
  private match: MatchController | null = null;

  constructor(code: string, dependencies: RoomDependencies) {
    this.code = code;
    this.dependencies = dependencies;
  }

  get isEmpty(): boolean {
    return this.members.length === 0;
  }

  get hasConnectedMembers(): boolean {
    return this.members.some((member) => member.connected);
  }

  get currentStatus(): RoomStatus {
    return this.status;
  }

  join(connectionId: string, playerName: string): RoomResult<{ playerId: string }> {
    if (this.status === 'playing') {
      return { ok: false, code: 'match_in_progress' };
    }
    if (this.members.length >= PLAYERS_PER_MATCH) {
      return { ok: false, code: 'room_full' };
    }
    const playerId = this.firstFreePlayerId();
    this.members.push({ connectionId, playerId, name: playerName, connected: true });
    this.hostConnectionId ??= connectionId;
    this.dependencies.send(connectionId, { type: 'room_joined', roomCode: this.code, playerId });
    this.broadcastRoomState();
    return { ok: true, value: { playerId } };
  }

  /** Remove quem saiu. Durante a partida, o bot assume o lugar; no saguão, a vaga some e o anfitrião passa ao próximo. */
  leave(connectionId: string): void {
    const member = this.members.find((candidate) => candidate.connectionId === connectionId);
    if (!member) {
      return;
    }
    if (this.status === 'playing') {
      member.connected = false;
      this.match?.handleDisconnect(member.playerId);
    } else {
      this.members.splice(this.members.indexOf(member), 1);
    }
    if (this.hostConnectionId === connectionId) {
      this.hostConnectionId = this.members.find((candidate) => candidate.connected)?.connectionId ?? null;
    }
    this.broadcastRoomState();
  }

  startMatch(connectionId: string): RoomResult {
    if (connectionId !== this.hostConnectionId) {
      return { ok: false, code: 'not_host' };
    }
    if (this.status === 'playing') {
      return { ok: false, code: 'match_in_progress' };
    }
    this.status = 'playing';
    const snapshot = this.dependencies.getContent?.() ?? { version: 0, content: DEFAULT_GAME_CONTENT };
    this.match = new MatchController({
      game: this.createGame(snapshot),
      humanIds: this.members.map((member) => member.playerId),
      scheduler: this.dependencies.scheduler,
      send: (playerId, message) => this.sendToPlayer(playerId, message),
      onEnded: () => this.returnToLobby(),
      contentVersion: snapshot.version,
    });
    this.broadcastRoomState();
    this.match.start();
    return { ok: true, value: undefined };
  }

  handleGameAction(connectionId: string, message: GameActionMessage): RoomResult {
    const member = this.members.find((candidate) => candidate.connectionId === connectionId);
    if (!member || this.status !== 'playing' || !this.match) {
      return { ok: false, code: 'no_match_running' };
    }
    this.match.handleAction(member.playerId, message);
    return { ok: true, value: undefined };
  }

  /** Fecha a sala (o servidor está parando): encerra a partida e avisa quem ainda está conectado. */
  close(): void {
    this.match?.dispose();
    this.match = null;
    this.members.forEach((member) => this.sendToMember(member, { type: 'room_closed' }));
    this.members.length = 0;
  }

  // --- Apoio --------------------------------------------------------------------------------------

  private createGame(snapshot: ContentSnapshot): Game {
    const { content } = snapshot;
    const humans = this.members.map((member) => ({ id: member.playerId, name: member.name, isBot: false }));
    const bots = Array.from({ length: PLAYERS_PER_MATCH - humans.length }, (_, index) => ({ id: `p${humans.length + index + 1}`, name: `Bot ${index + 1}`, isBot: true }));
    const rotationIndex = rotationIndexAt(this.dependencies.scheduler.nowMs(), content.rotation);
    const synergyIds = content.synergies.map((synergy) => synergy.id);
    return new Game({
      seed: this.dependencies.createMatchSeed(),
      roster: this.dependencies.roster ?? content.characters,
      players: [...humans, ...bots],
      config: content.config,
      synergies: content.synergies,
      synergyRotation: content.rotation,
      synergyMapping: synergyMappingForIndex(rotationIndex, content.rotation, content.initialSynergyMapping, synergyIds),
      rotationIndex,
    });
  }

  private returnToLobby(): void {
    this.status = 'lobby';
    this.match = null;
    for (const member of [...this.members]) {
      if (!member.connected) {
        this.members.splice(this.members.indexOf(member), 1);
      }
    }
    this.broadcastRoomState();
  }

  private firstFreePlayerId(): string {
    const used = new Set(this.members.map((member) => member.playerId));
    for (let seat = 1; seat <= PLAYERS_PER_MATCH; seat++) {
      if (!used.has(`p${seat}`)) {
        return `p${seat}`;
      }
    }
    throw new Error('Sala cheia.');
  }

  private broadcastRoomState(): void {
    const members: RoomMemberView[] = this.members.map((member) => ({
      playerId: member.playerId,
      name: member.name,
      isHost: member.connectionId === this.hostConnectionId,
      connected: member.connected,
    }));
    this.members.forEach((member) => this.sendToMember(member, { type: 'room_state', roomCode: this.code, status: this.status, members }));
  }

  private sendToPlayer(playerId: string, message: ServerMessage): void {
    const member = this.members.find((candidate) => candidate.playerId === playerId);
    if (member?.connected) {
      this.sendToMember(member, message);
    }
  }

  private sendToMember(member: Member, message: ServerMessage): void {
    this.dependencies.send(member.connectionId, message);
  }
}
