/** Porta do servidor de partidas no desenvolvimento (a mesma do padrão de `npm run server`). */
const DEVELOPMENT_SERVER_PORT = 8787;
/** Caminho do WebSocket quando a página e o servidor saem do mesmo endereço (o proxy o encaminha ao servidor). */
export const SOCKET_PATH = '/ws';

export interface PageLocation {
  /** Como em `window.location`: `http:` ou `https:`. */
  readonly protocol: string;
  readonly hostname: string;
  /** Nome e porta, quando não é a padrão. */
  readonly host: string;
}

export interface ServerAddressOptions {
  /** Página servida pelo servidor de desenvolvimento do Vite (o servidor de partidas roda à parte, na porta 8787). */
  readonly isDevelopment: boolean;
  readonly page: PageLocation;
  /** Endereço definido na hora do build (`VITE_SERVER_URL`), para quando a página é publicada em outro lugar. */
  readonly configuredUrl?: string;
}

/**
 * Endereço WebSocket que o jogo sugere:
 * 1. o definido no build, se houver;
 * 2. em desenvolvimento, `ws://<máquina da página>:8787`;
 * 3. na página publicada, o **mesmo endereço dela** com `/ws` (e `wss` quando a página é `https`).
 */
export function defaultSocketAddress({ isDevelopment, page, configuredUrl }: ServerAddressOptions): string {
  if (configuredUrl?.trim()) {
    return configuredUrl.trim().replace(/\/+$/, '');
  }
  if (isDevelopment) {
    return `ws://${page.hostname || 'localhost'}:${DEVELOPMENT_SERVER_PORT}`;
  }
  const protocol = page.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${page.host}${SOCKET_PATH}`;
}

/** Endereço HTTP do mesmo servidor, que o painel de administração sugere (sem caminho). */
export function defaultHttpAddress(options: ServerAddressOptions): string {
  const socketAddress = defaultSocketAddress(options);
  return socketAddress.replace(/^ws(s?):\/\//, 'http$1://').replace(/^(https?:\/\/[^/]+).*$/, '$1');
}
