import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import type { CharacterDefinition } from '@data/schemas/character';
import { Game } from '@core/game/Game';
import { rotationIndexAt, synergyMappingForIndex } from '@core/synergies/rotation';
import type { ContentSnapshot } from '../host/contentStore';
import type { GameActionMessage } from '../protocol/clientMessages';
import { applyRoomModifiers, combatRulesOf } from '@core/game/roomModifiers';
import { NO_ROOM_MODIFIERS, type RoomModifiers } from '@data/schemas/roomModifiers';
import type { RoomMemberView, RoomStatus, RoomSummaryView, RoomVisibility, ServerErrorCode, ServerMessage } from '../protocol/serverMessages';
import { DEFAULT_PLAYERS_PER_ROOM } from '../protocol/clientMessages';
import type { LiveActivity } from '../host/liveActivities';
import { RoomPassword } from './roomPassword';
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

/** Como a sala foi criada: quem pode ver, senha e regras especiais. */
export interface RoomSettings {
  readonly visibility: RoomVisibility;
  /** Senha em texto, só para criar o resumo; a sala não a guarda. */
  readonly password?: string;
  readonly modifiers: RoomModifiers;
  /** Total de jogadores da partida (pessoas e bots); sem ele, vale o tamanho padrão. */
  readonly maximumPlayers?: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = { visibility: 'public', modifiers: NO_ROOM_MODIFIERS };

/** Quantas pessoas podem assistir à mesma partida. */
export const MAXIMUM_SPECTATORS_PER_ROOM = 8;

export type RoomResult<Value = void> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly code: ServerErrorCode };

/**
 * Sala: reúne as pessoas, depois roda a partida (com bots nas vagas livres) e volta ao saguão quando ela acaba.
 * Durante a partida também aceita quem só quer assistir: essas conexões não ocupam vaga.
 */
export class Room {
  readonly code: string;
  private readonly dependencies: RoomDependencies;
  private readonly members: Member[] = [];
  private readonly spectatorIds = new Set<string>();
  private hostConnectionId: string | null = null;
  private status: RoomStatus = 'lobby';
  private match: MatchController | null = null;

  readonly visibility: RoomVisibility;
  readonly modifiers: RoomModifiers;
  readonly maximumPlayers: number;
  private readonly password: RoomPassword | null;

  constructor(code: string, dependencies: RoomDependencies, settings: RoomSettings = DEFAULT_ROOM_SETTINGS) {
    this.code = code;
    this.dependencies = dependencies;
    this.visibility = settings.visibility;
    this.modifiers = settings.modifiers;
    this.maximumPlayers = settings.maximumPlayers ?? DEFAULT_PLAYERS_PER_ROOM;
    this.password = settings.password ? RoomPassword.create(settings.password) : null;
  }

  get hasPassword(): boolean {
    return this.password !== null;
  }

  /** Sem senha, qualquer um passa; com senha, só quem a digitou certo. */
  acceptsPassword(candidate: string | undefined): boolean {
    return this.password === null || (candidate !== undefined && this.password.matches(candidate));
  }

  /** Está no saguão e ainda tem vaga? */
  get isOpenForPlayers(): boolean {
    return this.status === 'lobby' && this.members.length < this.maximumPlayers;
  }

  get canBeWatched(): boolean {
    return this.status === 'playing' && this.spectatorIds.size < MAXIMUM_SPECTATORS_PER_ROOM;
  }

  /** A conexão está na sala, jogando (ou esperando) ou assistindo. */
  includes(connectionId: string): boolean {
    return this.spectatorIds.has(connectionId) || this.members.some((member) => member.connectionId === connectionId && member.connected);
  }

  /** Como o painel de administração enxerga a sala. */
  activity(): LiveActivity {
    return {
      roomCode: this.code,
      status: this.status,
      playerNames: this.members.filter((member) => member.connected).map((member) => member.name),
      spectatorCount: this.spectatorIds.size,
      round: this.match?.round ?? null,
    };
  }

  /** Resumo para a lista de salas públicas. */
  summary(): RoomSummaryView {
    const host = this.members.find((member) => member.connectionId === this.hostConnectionId);
    return {
      roomCode: this.code,
      hostName: host?.name ?? '—',
      playerCount: this.members.length,
      maximumPlayers: this.maximumPlayers,
      hasPassword: this.hasPassword,
      status: this.status,
      modifiers: this.modifiers,
      spectatorCount: this.spectatorIds.size,
      canBeWatched: this.canBeWatched,
    };
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
    if (this.members.length >= this.maximumPlayers) {
      return { ok: false, code: 'room_full' };
    }
    const playerId = this.freeSeatIds()[0]!;
    this.members.push({ connectionId, playerId, name: playerName, connected: true });
    this.hostConnectionId ??= connectionId;
    this.dependencies.send(connectionId, { type: 'room_joined', roomCode: this.code, playerId });
    this.broadcastRoomState();
    return { ok: true, value: { playerId } };
  }

  addSpectator(connectionId: string): RoomResult {
    if (this.status !== 'playing' || !this.match) {
      return { ok: false, code: 'no_match_running' };
    }
    if (!this.canBeWatched) {
      return { ok: false, code: 'spectators_full' };
    }
    this.spectatorIds.add(connectionId);
    const watchedPlayerId = this.match.defaultWatchedPlayerId;
    this.dependencies.send(connectionId, { type: 'spectate_started', roomCode: this.code, watchedPlayerId, ...this.match.setupView() });
    this.match.addSpectator(connectionId, watchedPlayerId);
    return { ok: true, value: undefined };
  }

  watchPlayer(connectionId: string, playerId: string): RoomResult {
    if (!this.spectatorIds.has(connectionId) || !this.match) {
      return { ok: false, code: 'not_spectating' };
    }
    return this.match.watch(connectionId, playerId) ? { ok: true, value: undefined } : { ok: false, code: 'unknown_player' };
  }

  /** Remove quem saiu. Durante a partida, o bot assume o lugar; no saguão, a vaga some e o anfitrião passa ao próximo. */
  leave(connectionId: string): void {
    if (this.spectatorIds.delete(connectionId)) {
      this.match?.removeSpectator(connectionId);
      return;
    }
    const member = this.members.find((candidate) => candidate.connectionId === connectionId);
    if (!member) {
      return;
    }
    if (this.status === 'playing') {
      member.connected = false;
      if (!this.hasConnectedMembers) {
        // Ninguém mais joga: quem guarda as salas fecha esta (e avisa quem assistia).
        return;
      }
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
    if (this.spectatorIds.has(connectionId)) {
      return { ok: false, code: 'spectator_cannot_act' };
    }
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
      sendToSpectator: (spectatorId, message) => this.dependencies.send(spectatorId, message),
      onEnded: () => this.returnToLobby(),
      contentVersion: snapshot.version,
      modifiers: this.modifiers,
    });
    this.broadcastRoomState();
    this.match.start();
    return { ok: true, value: undefined };
  }

  handleGameAction(connectionId: string, message: GameActionMessage): RoomResult {
    // Quem assiste não mexe na partida, mande o cliente o que mandar.
    if (this.spectatorIds.has(connectionId)) {
      return { ok: false, code: 'spectator_cannot_act' };
    }
    const member = this.members.find((candidate) => candidate.connectionId === connectionId);
    if (!member || this.status !== 'playing' || !this.match) {
      return { ok: false, code: 'no_match_running' };
    }
    this.match.handleAction(member.playerId, message);
    return { ok: true, value: undefined };
  }

  /** Fecha a sala: encerra a partida e avisa quem joga e quem assiste. Com `notice`, a tela explica o motivo. */
  close(notice?: string): void {
    this.match?.dispose();
    this.match = null;
    const closed: ServerMessage = notice ? { type: 'room_closed', notice } : { type: 'room_closed' };
    this.connectedMembers().forEach((member) => this.sendToMember(member, closed));
    this.spectatorIds.forEach((spectatorId) => this.dependencies.send(spectatorId, closed));
    this.members.length = 0;
    this.spectatorIds.clear();
  }

  // --- Apoio --------------------------------------------------------------------------------------

  private createGame(snapshot: ContentSnapshot): Game {
    const { content } = snapshot;
    const humans = this.members.map((member) => ({ id: member.playerId, name: member.name, isBot: false }));
    // Os bots ocupam os lugares que ninguém pegou (quem saiu do saguão pode ter deixado um buraco no meio).
    const bots = this.freeSeatIds().map((id, index) => ({ id, name: `Bot ${index + 1}`, isBot: true }));
    const rotationIndex = rotationIndexAt(this.dependencies.scheduler.nowMs(), content.rotation);
    const synergyIds = content.synergies.map((synergy) => synergy.id);
    return new Game({
      seed: this.dependencies.createMatchSeed(),
      roster: this.dependencies.roster ?? content.characters,
      players: [...humans, ...bots],
      config: applyRoomModifiers(content.config, this.modifiers),
      combatRules: combatRulesOf(this.modifiers),
      synergies: content.synergies,
      synergyRotation: content.rotation,
      synergyMapping: synergyMappingForIndex(rotationIndex, content.rotation, content.initialSynergyMapping, synergyIds),
      rotationIndex,
    });
  }

  private returnToLobby(): void {
    this.status = 'lobby';
    this.match = null;
    // Quem assistia recebeu o fim da partida e volta ao hub por conta própria.
    this.spectatorIds.clear();
    for (const member of [...this.members]) {
      if (!member.connected) {
        this.members.splice(this.members.indexOf(member), 1);
      }
    }
    this.broadcastRoomState();
  }

  private freeSeatIds(): string[] {
    const used = new Set(this.members.map((member) => member.playerId));
    const allSeats = Array.from({ length: this.maximumPlayers }, (_, index) => `p${index + 1}`);
    return allSeats.filter((seat) => !used.has(seat));
  }

  private connectedMembers(): Member[] {
    return this.members.filter((member) => member.connected);
  }

  private broadcastRoomState(): void {
    const members: RoomMemberView[] = this.members.map((member) => ({
      playerId: member.playerId,
      name: member.name,
      isHost: member.connectionId === this.hostConnectionId,
      connected: member.connected,
    }));
    // Quem já saiu não recebe mais nada da sala, senão a tela dele voltaria para dentro dela.
    this.connectedMembers().forEach((member) =>
      this.sendToMember(member, {
        type: 'room_state',
        roomCode: this.code,
        status: this.status,
        members,
        visibility: this.visibility,
        hasPassword: this.hasPassword,
        modifiers: this.modifiers,
        maximumPlayers: this.maximumPlayers,
      }),
    );
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
