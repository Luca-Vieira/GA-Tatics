import type { RoomMemberView, RoomStatus, ServerErrorCode, ServerMessage } from '../protocol/serverMessages';
import { RemoteMatchSession } from './RemoteMatchSession';
import type { ServerConnection } from './ServerConnection';

export interface LobbyState {
  readonly roomCode: string | null;
  readonly playerId: string | null;
  readonly status: RoomStatus;
  readonly members: readonly RoomMemberView[];
}

const EMPTY_STATE: LobbyState = { roomCode: null, playerId: null, status: 'lobby', members: [] };

export const SERVER_ERROR_MESSAGES: Readonly<Record<ServerErrorCode, string>> = {
  invalid_message: 'O servidor não entendeu a mensagem.',
  message_too_large: 'Mensagem grande demais.',
  invalid_json: 'O servidor não entendeu a mensagem.',
  rate_limited: 'Muitas ações em pouco tempo. Espere um instante.',
  not_in_room: 'Você não está em uma sala.',
  already_in_room: 'Você já está em uma sala.',
  room_not_found: 'Sala não encontrada. Confira o código.',
  room_full: 'A sala está cheia.',
  match_in_progress: 'A partida dessa sala já começou.',
  not_host: 'Só o anfitrião pode iniciar a partida.',
  no_match_running: 'Não há partida em andamento.',
  server_full: 'O servidor está cheio. Tente de novo mais tarde.',
  internal_error: 'Erro no servidor.',
};

/**
 * Saguão visto pelo cliente: acompanha a sala (código, jogadores, anfitrião) e, quando o anfitrião inicia a partida,
 * entrega a `RemoteMatchSession` que passa a tratar as mensagens da partida. Continua ouvindo a sala durante a partida,
 * por isso o saguão já está atualizado quando o jogador volta a ele.
 */
export class LobbyClient {
  private currentState: LobbyState = EMPTY_STATE;
  private readonly changeHandlers = new Set<() => void>();
  private readonly errorHandlers = new Set<(message: string) => void>();
  private readonly matchHandlers = new Set<(session: RemoteMatchSession) => void>();
  private readonly staleHandlers = new Set<() => void>();
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

  get isConnected(): boolean {
    return this.connection.isOpen;
  }

  get isInRoom(): boolean {
    return this.currentState.roomCode !== null;
  }

  get isHost(): boolean {
    return this.currentState.members.some((member) => member.playerId === this.currentState.playerId && member.isHost);
  }

  createRoom(playerName: string): void {
    this.connection.send({ type: 'create_room', playerName });
  }

  joinRoom(roomCode: string, playerName: string): void {
    this.connection.send({ type: 'join_room', roomCode, playerName });
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

  onConnectionClosed(handler: () => void): () => void {
    return this.connection.onClose(handler);
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'room_joined':
        this.update({ ...this.currentState, roomCode: message.roomCode, playerId: message.playerId });
        return;
      case 'room_state':
        this.update({ ...this.currentState, roomCode: message.roomCode, status: message.status, members: message.members });
        return;
      case 'room_closed':
        this.update(EMPTY_STATE);
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
    if (playerId === null) {
      return;
    }
    const { version, content } = this.connection.content;
    if (message.contentVersion !== version) {
      // A partida foi criada com conteúdo que esta página não tem: sair da sala (o bot assume) e pedir para recarregar.
      this.markContentStale(message.contentVersion);
      this.leaveRoom();
      return;
    }
    const session = new RemoteMatchSession(this.connection, playerId, message, content, this.connection.httpBaseUrl);
    this.matchHandlers.forEach((handler) => handler(session));
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
