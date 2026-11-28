import type { GameContent } from '@data/schemas/content';
import { NO_ROOM_MODIFIERS, type RoomModifiers } from '@data/schemas/roomModifiers';
import { DEFAULT_PLAYERS_PER_ROOM } from '../protocol/clientMessages';
import type { MatchSetupView, RoomMemberView, RoomStatus, RoomSummaryView, RoomVisibility, ServerErrorCode, ServerMessage } from '../protocol/serverMessages';
import { RemoteMatchSession } from './RemoteMatchSession';
import type { ServerConnection } from './ServerConnection';

export interface LobbyState {
  readonly roomCode: string | null;
  readonly playerId: string | null;
  readonly status: RoomStatus;
  readonly members: readonly RoomMemberView[];
  readonly visibility: RoomVisibility;
  readonly hasPassword: boolean;
  readonly modifiers: RoomModifiers;
  readonly maximumPlayers: number;
  readonly mapId: string | null;
}

const EMPTY_STATE: LobbyState = {
  roomCode: null,
  playerId: null,
  status: 'lobby',
  members: [],
  visibility: 'public',
  hasPassword: false,
  modifiers: NO_ROOM_MODIFIERS,
  maximumPlayers: DEFAULT_PLAYERS_PER_ROOM,
  mapId: null,
};

/** O que quem cria a sala escolhe. */
export interface CreateRoomOptions {
  readonly visibility?: RoomVisibility;
  readonly password?: string;
  readonly modifiers?: Partial<RoomModifiers>;
  readonly maximumPlayers?: number;
  /** Sem ele, o mapa é sorteado. */
  readonly mapId?: string;
}

export const SERVER_ERROR_MESSAGES: Readonly<Record<ServerErrorCode, string>> = {
  invalid_message: 'O servidor não entendeu a mensagem.',
  message_too_large: 'Mensagem grande demais.',
  invalid_json: 'O servidor não entendeu a mensagem.',
  rate_limited: 'Muitas ações em pouco tempo. Espere um instante.',
  not_in_room: 'Você não está em uma sala.',
  already_in_room: 'Você já está em uma sala.',
  room_not_found: 'Sala não encontrada. Confira o código.',
  room_full: 'A sala está cheia.',
  wrong_password: 'Senha da sala incorreta.',
  match_in_progress: 'A partida dessa sala já começou.',
  not_host: 'Só o anfitrião pode iniciar a partida.',
  no_match_running: 'Não há partida em andamento.',
  spectators_full: 'Essa partida já tem o máximo de espectadores.',
  spectator_cannot_act: 'Quem assiste não pode mexer na partida.',
  not_spectating: 'Você não está assistindo a uma partida.',
  unknown_player: 'Esse jogador não está na partida.',
  server_full: 'O servidor está cheio. Tente de novo mais tarde.',
  internal_error: 'Erro no servidor.',
};

/**
 * Saguão visto pelo cliente: acompanha a lista de salas públicas e a sala em que a pessoa está (código, jogadores,
 * anfitrião, visibilidade e regras) e, quando o anfitrião inicia a partida, entrega a `RemoteMatchSession` que passa a
 * tratar as mensagens da partida. Continua ouvindo a sala durante a partida, por isso o saguão já está atualizado
 * quando o jogador volta a ele.
 */
export class LobbyClient {
  private currentState: LobbyState = EMPTY_STATE;
  private currentRooms: readonly RoomSummaryView[] = [];
  private readonly changeHandlers = new Set<() => void>();
  private readonly roomListHandlers = new Set<() => void>();
  private readonly errorHandlers = new Set<(message: string) => void>();
  private readonly matchHandlers = new Set<(session: RemoteMatchSession) => void>();
  private readonly staleHandlers = new Set<() => void>();
  private readonly roomClosedHandlers = new Set<(notice: string) => void>();
  private contentIsStale = false;

  constructor(private readonly connection: ServerConnection) {
    connection.onMessage((message) => this.handle(message));
  }

  /** O servidor tem conteúdo mais novo que o desta página: é preciso recarregar a página para jogar com ele. */
  get isContentStale(): boolean {
    return this.contentIsStale;
  }

  get state(): LobbyState {
    return this.currentState;
  }

  /** Salas públicas da última consulta (`refreshRooms`). */
  get rooms(): readonly RoomSummaryView[] {
    return this.currentRooms;
  }

  /** Conteúdo do jogo vigente no servidor quando a conexão foi aberta. */
  get content(): GameContent {
    return this.connection.content.content;
  }

  /** Endereço HTTP de onde saem os sprites do servidor. */
  get spriteBaseUrl(): string {
    return this.connection.httpBaseUrl;
  }

  get isConnected(): boolean {
    return this.connection.isOpen;
  }

  get isInRoom(): boolean {
    return this.currentState.roomCode !== null;
  }

  get isHost(): boolean {
    return this.currentState.members.some((member) => member.playerId === this.currentState.playerId && member.isHost);
  }

  /** Pede a lista de salas públicas; a resposta chega em `onRoomList`. */
  refreshRooms(): void {
    this.connection.send({ type: 'list_rooms' });
  }

  /** Entra numa sala pública aberta ou cria uma. */
  quickMatch(playerName: string): void {
    this.connection.send({ type: 'quick_match', playerName });
  }

  createRoom(playerName: string, options: CreateRoomOptions = {}): void {
    this.connection.send({
      type: 'create_room',
      playerName,
      visibility: options.visibility ?? 'public',
      ...(options.password ? { password: options.password } : {}),
      modifiers: { ...NO_ROOM_MODIFIERS, ...options.modifiers },
      maximumPlayers: options.maximumPlayers ?? DEFAULT_PLAYERS_PER_ROOM,
      ...(options.mapId ? { mapId: options.mapId } : {}),
    });
  }

  joinRoom(roomCode: string, playerName: string, password?: string): void {
    this.connection.send({ type: 'join_room', roomCode, playerName, ...(password ? { password } : {}) });
  }

  /** Assiste a uma partida em andamento; a sessão chega em `onMatchStarted`. */
  spectate(roomCode: string, password?: string): void {
    this.connection.send({ type: 'spectate_room', roomCode, ...(password ? { password } : {}) });
  }

  leaveRoom(): void {
    this.connection.send({ type: 'leave_room' });
    this.update(EMPTY_STATE);
  }

  startMatch(): void {
    this.connection.send({ type: 'start_match' });
  }

  /** Fecha a conexão (sai da sala junto). */
  disconnect(): void {
    this.connection.close();
  }

  onChange(handler: () => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  onRoomList(handler: () => void): () => void {
    this.roomListHandlers.add(handler);
    return () => this.roomListHandlers.delete(handler);
  }

  onError(handler: (message: string) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onMatchStarted(handler: (session: RemoteMatchSession) => void): () => void {
    this.matchHandlers.add(handler);
    return () => this.matchHandlers.delete(handler);
  }

  /** Chamado quando o administrador publica conteúdo novo (ou uma partida nova exige uma versão que esta página não tem). */
  onContentStale(handler: () => void): () => void {
    this.staleHandlers.add(handler);
    return () => this.staleHandlers.delete(handler);
  }

  /** A sala foi encerrada por fora (administrador, ou os jogadores saíram); vem com o motivo. */
  onRoomClosed(handler: (notice: string) => void): () => void {
    this.roomClosedHandlers.add(handler);
    return () => this.roomClosedHandlers.delete(handler);
  }

  onConnectionClosed(handler: () => void): () => void {
    return this.connection.onClose(handler);
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'room_joined':
        this.update({ ...this.currentState, roomCode: message.roomCode, playerId: message.playerId });
        return;
      case 'room_state':
        // Um estado que chegue atrasado, depois de a pessoa sair, não a leva de volta para a sala.
        if (message.roomCode !== this.currentState.roomCode) {
          return;
        }
        this.update({
          ...this.currentState,
          roomCode: message.roomCode,
          status: message.status,
          members: message.members,
          visibility: message.visibility,
          hasPassword: message.hasPassword,
          modifiers: message.modifiers,
          maximumPlayers: message.maximumPlayers,
          mapId: message.mapId,
        });
        return;
      case 'room_list':
        this.currentRooms = message.rooms;
        this.roomListHandlers.forEach((handler) => handler());
        return;
      case 'room_closed':
        this.closeRoom(message.notice);
        return;
      case 'spectate_started':
        this.startSpectatorSession(message);
        return;
      case 'content_updated':
        this.markContentStale(message.contentVersion);
        return;
      case 'match_started':
        this.startMatchSession(message);
        return;
      case 'error':
        this.errorHandlers.forEach((handler) => handler(SERVER_ERROR_MESSAGES[message.code] ?? 'Erro desconhecido.'));
        return;
      default:
        return;
    }
  }

  private startMatchSession(message: Extract<ServerMessage, { type: 'match_started' }>): void {
    const playerId = this.currentState.playerId;
    if (playerId !== null) {
      this.openSession(playerId, message, false);
    }
  }

  private startSpectatorSession(message: Extract<ServerMessage, { type: 'spectate_started' }>): void {
    this.openSession(message.watchedPlayerId, message, true);
  }

  private openSession(humanId: string, setup: MatchSetupView, isSpectator: boolean): void {
    const { version, content } = this.connection.content;
    if (setup.contentVersion !== version) {
      // A partida foi criada com conteúdo que esta página não tem: sair da sala (o bot assume) e pedir para recarregar.
      this.markContentStale(setup.contentVersion);
      this.leaveRoom();
      return;
    }
    const session = new RemoteMatchSession(this.connection, humanId, setup, content, this.connection.httpBaseUrl, { isSpectator, leaveRoom: () => this.leaveRoom() });
    this.matchHandlers.forEach((handler) => handler(session));
  }

  private closeRoom(notice: string | undefined): void {
    this.update(EMPTY_STATE);
    if (notice) {
      [...this.roomClosedHandlers].forEach((handler) => handler(notice));
    }
  }

  private markContentStale(serverVersion: number): void {
    if (serverVersion === this.connection.content.version) {
      return;
    }
    this.contentIsStale = true;
    this.staleHandlers.forEach((handler) => handler());
  }

  private update(state: LobbyState): void {
    this.currentState = state;
    this.changeHandlers.forEach((handler) => handler());
  }
}
