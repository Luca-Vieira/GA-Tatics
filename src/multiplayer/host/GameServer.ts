import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { isGameAction, MAXIMUM_MESSAGE_BYTES, parseClientMessage, type ParsedClientMessage } from '../protocol/clientMessages';
import { PROTOCOL_VERSION, type ServerErrorCode, type ServerMessage } from '../protocol/serverMessages';
import { RoomRegistry } from '../rooms/RoomRegistry';
import type { RoomResult } from '../rooms/Room';
import { AdminApi } from './adminApi';
import { AdminAuth, validateAdminCredentials, type AdminCredentials } from './adminAuth';
import { ContentStore } from './contentStore';
import { SpriteStore } from './spriteStore';
import { isOriginAllowed } from './originPolicy';
import { RateLimiter } from './rateLimiter';
import { realScheduler, type Scheduler } from './scheduler';

export const DEFAULT_PORT = 8787;
/** Por padrão só a própria máquina conecta; abrir para a rede é uma escolha explícita (`--lan`). */
export const LOOPBACK_HOST = '127.0.0.1';

const WEBSOCKET_POLICY_VIOLATION = 1008;
const WEBSOCKET_TRY_AGAIN_LATER = 1013;
const MAXIMUM_RATE_LIMIT_VIOLATIONS = 50;
const MAXIMUM_PASSWORD_FAILURES = 8;

export interface GameServerOptions {
  readonly host?: string;
  /** 0 pede uma porta livre ao sistema (útil nos testes). */
  readonly port?: number;
  readonly maximumConnections?: number;
  readonly maximumRooms?: number;
  /** Rajada máxima de mensagens por conexão e quantas fichas voltam por segundo. */
  readonly messageBurst?: number;
  readonly messagesPerSecond?: number;
  readonly heartbeatIntervalMs?: number;
  readonly scheduler?: Scheduler;
  readonly log?: (line: string) => void;
  /** Onde o conteúdo do jogo (elenco, sinergias, configuração) fica guardado. Sem ele, vale o conteúdo padrão, só em memória. */
  readonly contentStore?: ContentStore;
  /** Onde os sprites enviados pelo painel ficam guardados. Sem ele, ficam só em memória. */
  readonly spriteStore?: SpriteStore;
  /** Usuário e senha do painel de administração. Sem eles (ou com senha curta) o painel fica desligado. */
  readonly adminCredentials?: AdminCredentials | null;
}

interface Connection {
  readonly id: string;
  readonly socket: WebSocket;
  readonly rateLimiter: RateLimiter;
  rateLimitViolations: number;
  /** Senhas de sala erradas seguidas: passou do limite, a conexão é fechada (impede adivinhar senhas). */
  passwordFailures: number;
  isAlive: boolean;
}

/**
 * Servidor WebSocket da partida. Não confia em nenhum cliente: cada mensagem é validada, limitada em tamanho e em
 * frequência, e só o `Game` no servidor decide o que acontece. Não lê arquivos nem executa nada vindo da rede.
 */
export class GameServer {
  private readonly options: Required<Omit<GameServerOptions, 'scheduler' | 'log' | 'contentStore' | 'spriteStore' | 'adminCredentials'>>;
  private readonly scheduler: Scheduler;
  private readonly log: (line: string) => void;
  private readonly connections = new Map<string, Connection>();
  private readonly registry: RoomRegistry;
  private readonly contentStore: ContentStore;
  private readonly adminApi: AdminApi;
  private readonly spriteStore: SpriteStore;
  private stopListeningToContent: (() => void) | null = null;
  private httpServer: HttpServer | null = null;
  private webSocketServer: WebSocketServer | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(options: GameServerOptions = {}) {
    this.options = {
      host: options.host ?? LOOPBACK_HOST,
      port: options.port ?? DEFAULT_PORT,
      maximumConnections: options.maximumConnections ?? 64,
      maximumRooms: options.maximumRooms ?? 16,
      messageBurst: options.messageBurst ?? 30,
      messagesPerSecond: options.messagesPerSecond ?? 10,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15_000,
    };
    this.scheduler = options.scheduler ?? realScheduler;
    this.log = options.log ?? (() => undefined);
    this.contentStore = options.contentStore ?? new ContentStore();
    this.spriteStore = options.spriteStore ?? new SpriteStore();
    const credentials = options.adminCredentials ?? null;
    const credentialsProblem = validateAdminCredentials(credentials);
    if (credentialsProblem) {
      this.log(`Painel de administração desligado. ${credentialsProblem}`);
    }
    const adminAuth = credentialsProblem || !credentials ? null : new AdminAuth(credentials);
    if (adminAuth) {
      this.log('Painel de administração ligado (API em /api/admin/).');
    }
    this.adminApi = new AdminApi({ auth: adminAuth, store: this.contentStore, sprites: this.spriteStore, log: this.log });
    this.registry = new RoomRegistry({
      maximumRooms: this.options.maximumRooms,
      dependencies: {
        scheduler: this.scheduler,
        send: (connectionId, message) => this.send(connectionId, message),
        createMatchSeed: () => randomBytes(16).toString('hex'),
        getContent: () => this.contentStore.snapshot,
      },
    });
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  get roomCount(): number {
    return this.registry.roomCount;
  }

  start(): Promise<{ host: string; port: number }> {
    return new Promise((resolve, reject) => {
      // O mesmo endereço atende o jogo (WebSocket) e a API do painel de administração (HTTP).
      const httpServer = createServer((request, response) => {
        if (this.adminApi.handle(request, response) || this.serveSprite(request.method, request.url, response)) {
          return;
        }
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Servidor do Merge do Escritório.');
      });
      const server = new WebSocketServer({ server: httpServer, maxPayload: MAXIMUM_MESSAGE_BYTES });
      this.httpServer = httpServer;
      this.webSocketServer = server;
      httpServer.once('error', reject);
      server.on('connection', (socket, request) => this.acceptConnection(socket, request.headers.origin));
      httpServer.once('listening', () => {
        httpServer.off('error', reject);
        httpServer.on('error', (error) => this.log(`Erro no servidor: ${error.message}`));
        this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), this.options.heartbeatIntervalMs);
        this.heartbeatTimer.unref();
        this.stopListeningToContent = this.contentStore.onChange((snapshot) => this.broadcast({ type: 'content_updated', contentVersion: snapshot.version }));
        const address = httpServer.address() as AddressInfo;
        resolve({ host: address.address, port: address.port });
      });
      httpServer.listen(this.options.port, this.options.host);
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.stopListeningToContent?.();
    this.stopListeningToContent = null;
    this.registry.closeAll();
    this.connections.forEach((connection) => connection.socket.terminate());
    this.connections.clear();
    const server = this.webSocketServer;
    const httpServer = this.httpServer;
    this.webSocketServer = null;
    this.httpServer = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (httpServer) {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }

  // --- Conexões -----------------------------------------------------------------------------------

  private acceptConnection(socket: WebSocket, origin: string | undefined): void {
    if (!isOriginAllowed(origin)) {
      this.log(`Conexão recusada: origem não permitida (${origin}).`);
      socket.close(WEBSOCKET_POLICY_VIOLATION, 'origin_not_allowed');
      return;
    }
    if (this.connections.size >= this.options.maximumConnections) {
      socket.close(WEBSOCKET_TRY_AGAIN_LATER, 'server_full');
      return;
    }
    const connection: Connection = {
      id: randomUUID(),
      socket,
      rateLimiter: new RateLimiter(this.options.messageBurst, this.options.messagesPerSecond, this.scheduler.nowMs()),
      rateLimitViolations: 0,
      passwordFailures: 0,
      isAlive: true,
    };
    this.connections.set(connection.id, connection);
    socket.on('pong', () => {
      connection.isAlive = true;
    });
    socket.on('message', (data, isBinary) => this.receive(connection, data, isBinary));
    socket.on('close', () => this.dropConnection(connection));
    socket.on('error', () => socket.terminate());
    const { version, content } = this.contentStore.snapshot;
    this.send(connection.id, { type: 'hello', protocolVersion: PROTOCOL_VERSION, contentVersion: version, content });
  }

  private dropConnection(connection: Connection): void {
    this.registry.leave(connection.id);
    this.connections.delete(connection.id);
  }

  private checkHeartbeats(): void {
    for (const connection of this.connections.values()) {
      if (!connection.isAlive) {
        connection.socket.terminate();
        continue;
      }
      connection.isAlive = false;
      connection.socket.ping();
    }
  }

  // --- Mensagens ----------------------------------------------------------------------------------

  private receive(connection: Connection, data: RawData, isBinary: boolean): void {
    if (!connection.rateLimiter.tryConsume(this.scheduler.nowMs())) {
      connection.rateLimitViolations++;
      if (connection.rateLimitViolations > MAXIMUM_RATE_LIMIT_VIOLATIONS) {
        connection.socket.close(WEBSOCKET_POLICY_VIOLATION, 'rate_limited');
      } else {
        this.sendError(connection.id, 'rate_limited');
      }
      return;
    }
    if (isBinary) {
      this.sendError(connection.id, 'invalid_message');
      return;
    }
    const parsed = parseClientMessage(rawDataToText(data));
    if (!parsed.ok) {
      this.sendError(connection.id, parsed.reason as ServerErrorCode);
      return;
    }
    try {
      this.handle(connection.id, parsed.message);
    } catch (error) {
      // Um erro inesperado nunca derruba o servidor nem as outras salas.
      this.log(`Erro ao tratar mensagem: ${error instanceof Error ? error.message : String(error)}`);
      this.sendError(connection.id, 'internal_error');
    }
  }

  private handle(connectionId: string, message: ParsedClientMessage): void {
    switch (message.type) {
      case 'create_room':
        this.report(connectionId, this.registry.createRoom(connectionId, message.playerName, { visibility: message.visibility, password: message.password, modifiers: message.modifiers }));
        return;
      case 'join_room':
        this.report(connectionId, this.registry.joinRoom(connectionId, message.roomCode, message.playerName, message.password));
        return;
      case 'list_rooms':
        this.send(connectionId, { type: 'room_list', rooms: this.registry.listPublicRooms() });
        return;
      case 'quick_match':
        this.report(connectionId, this.registry.quickMatch(connectionId, message.playerName));
        return;
      case 'leave_room':
        this.leaveRoom(connectionId);
        return;
      case 'start_match':
        this.report(connectionId, this.registry.roomOf(connectionId)?.startMatch(connectionId) ?? notInRoom());
        return;
      default:
        if (isGameAction(message)) {
          this.report(connectionId, this.registry.roomOf(connectionId)?.handleGameAction(connectionId, message) ?? notInRoom());
        }
    }
  }

  private leaveRoom(connectionId: string): void {
    if (!this.registry.roomOf(connectionId)) {
      this.sendError(connectionId, 'not_in_room');
      return;
    }
    this.registry.leave(connectionId);
  }

  private report(connectionId: string, result: RoomResult<unknown>): void {
    const connection = this.connections.get(connectionId);
    if (result.ok) {
      if (connection) connection.passwordFailures = 0;
      return;
    }
    this.sendError(connectionId, result.code);
    if (connection && result.code === 'wrong_password' && ++connection.passwordFailures > MAXIMUM_PASSWORD_FAILURES) {
      connection.socket.close(WEBSOCKET_POLICY_VIOLATION, 'too_many_wrong_passwords');
    }
  }

  private sendError(connectionId: string, code: ServerErrorCode): void {
    this.send(connectionId, { type: 'error', code });
  }

  /** Entrega pública (sem login) dos sprites: o nome tem o hash do conteúdo, então o navegador pode guardar para sempre. */
  private serveSprite(method: string | undefined, url: string | undefined, response: ServerResponse): boolean {
    const path = (url ?? '').split('?')[0] ?? '';
    if (!path.startsWith('/sprites/') || (method !== 'GET' && method !== 'HEAD')) {
      return false;
    }
    const bytes = this.spriteStore.read(path);
    if (!bytes) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Sprite não encontrado.');
      return true;
    }
    response.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    });
    response.end(method === 'HEAD' ? undefined : bytes);
    return true;
  }

  private broadcast(message: ServerMessage): void {
    this.connections.forEach((connection) => this.send(connection.id, message));
  }

  private send(connectionId: string, message: ServerMessage): void {
    const socket = this.connections.get(connectionId)?.socket;
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}

function notInRoom(): RoomResult<never> {
  return { ok: false, code: 'not_in_room' };
}

function rawDataToText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8');
}
