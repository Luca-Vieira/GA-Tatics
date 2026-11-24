import { validateGameContent, type GameContent } from '@data/schemas/content';
import type { ClientMessage } from '../protocol/clientMessages';
import { PROTOCOL_VERSION, type ServerMessage } from '../protocol/serverMessages';
import { RateLimiter } from '../host/rateLimiter';

/** O servidor aceita rajadas de 30 e 10 por segundo; o cliente se limita abaixo disso para nunca ser punido por um arraste nervoso. */
const CLIENT_MESSAGE_BURST = 20;
const CLIENT_MESSAGES_PER_SECOND = 6;
const CONNECT_TIMEOUT_MS = 5000;

type MessageHandler = (message: ServerMessage) => void;

/** Subconjunto do `WebSocket` usado aqui; o navegador e o Node (versão 22 em diante) o oferecem. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export type SocketFactory = (url: string) => SocketLike;

const SOCKET_OPEN = 1;

export class ConnectionError extends Error {}

/** O conteúdo do jogo (elenco, sinergias, configuração) que o servidor tinha ao receber esta conexão. */
export interface ServerContent {
  readonly version: number;
  readonly content: GameContent;
}

/** Conexão WebSocket com o servidor da partida: entrega só mensagens conhecidas e limita o que envia. */
export class ServerConnection {
  private readonly handlers = new Set<MessageHandler>();
  private readonly closeHandlers = new Set<() => void>();
  private readonly rateLimiter: RateLimiter;
  private isClosed = false;
  private serverContent: ServerContent | null = null;

  private constructor(
    private readonly socket: SocketLike,
    private readonly nowMs: () => number,
    readonly url: string,
  ) {
    this.rateLimiter = new RateLimiter(CLIENT_MESSAGE_BURST, CLIENT_MESSAGES_PER_SECOND, nowMs());
  }

  /** Conecta e espera o cumprimento (`hello`) do servidor, conferindo a versão do protocolo. */
  static connect(url: string, socketFactory: SocketFactory = (address) => new WebSocket(address), nowMs: () => number = Date.now): Promise<ServerConnection> {
    return new Promise((resolve, reject) => {
      let socket: SocketLike;
      try {
        socket = socketFactory(url);
      } catch {
        reject(new ConnectionError('Endereço de servidor inválido.'));
        return;
      }
      const connection = new ServerConnection(socket, nowMs, url);
      const timeout = setTimeout(() => fail('O servidor não respondeu.'), CONNECT_TIMEOUT_MS);
      let isSettled = false;

      function fail(reason: string): void {
        if (isSettled) {
          return;
        }
        isSettled = true;
        clearTimeout(timeout);
        socket.close();
        reject(new ConnectionError(reason));
      }

      socket.addEventListener('error', () => fail('Não foi possível conectar ao servidor.'));
      socket.addEventListener('close', () => {
        fail('A conexão foi encerrada.');
        connection.handleClose();
      });
      socket.addEventListener('message', (event) => {
        const message = parseServerMessage(event.data);
        if (!message) {
          return;
        }
        if (!isSettled) {
          if (message.type !== 'hello') {
            return;
          }
          if (message.protocolVersion !== PROTOCOL_VERSION) {
            fail('Versão do servidor incompatível com este cliente.');
            return;
          }
          const validation = validateGameContent(message.content);
          if (!validation.ok || typeof message.contentVersion !== 'number') {
            fail('O servidor enviou um conteúdo de jogo inválido.');
            return;
          }
          connection.serverContent = { version: message.contentVersion, content: validation.content };
          isSettled = true;
          clearTimeout(timeout);
          resolve(connection);
          return;
        }
        connection.handlers.forEach((handler) => handler(message));
      });
    });
  }

  /** Endereço HTTP do mesmo servidor (de onde saem os sprites): `ws://host:porta` vira `http://host:porta`. */
  get httpBaseUrl(): string {
    try {
      const address = new URL(this.url);
      address.protocol = address.protocol === 'wss:' ? 'https:' : 'http:';
      return address.origin;
    } catch {
      return '';
    }
  }

  /** Conteúdo vigente no servidor quando a conexão foi aberta. */
  get content(): ServerContent {
    if (!this.serverContent) {
      throw new ConnectionError('A conexão ainda não recebeu o conteúdo do jogo.');
    }
    return this.serverContent;
  }

  get isOpen(): boolean {
    return !this.isClosed && this.socket.readyState === SOCKET_OPEN;
  }

  /** Devolve `false` quando a mensagem não foi enviada (conexão fechada ou limite do cliente). */
  send(message: ClientMessage): boolean {
    if (!this.isOpen || !this.rateLimiter.tryConsume(this.nowMs())) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  close(): void {
    this.socket.close();
    this.handleClose();
  }

  private handleClose(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.closeHandlers.forEach((handler) => handler());
  }
}

/** Texto da rede → mensagem. Só confere que é um objeto com `type`; o servidor é a fonte confiável do formato. */
function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(data);
    const isMessage = typeof parsed === 'object' && parsed !== null && typeof (parsed as { type?: unknown }).type === 'string';
    return isMessage ? (parsed as ServerMessage) : null;
  } catch {
    return null;
  }
}
