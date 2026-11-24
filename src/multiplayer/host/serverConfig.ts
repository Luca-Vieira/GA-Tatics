import type { AdminCredentials } from './adminAuth';
import { parseAllowedOrigins } from './originPolicy';

export const DEFAULT_SERVER_PORT = 8787;
export const LOOPBACK_ADDRESS = '127.0.0.1';
export const ALL_INTERFACES_ADDRESS = '0.0.0.0';
const DEFAULT_DATA_DIRECTORY = 'server-data';

export interface ServerConfig {
  /** Onde o servidor escuta. O padrão só aceita a própria máquina. */
  readonly host: string;
  readonly port: number;
  /** Pasta do conteúdo editado e dos sprites. Precisa ser um disco que não seja apagado. */
  readonly dataDirectory: string;
  /** Endereços de páginas (além das locais e de rede privada) que podem conectar. */
  readonly allowedOrigins: readonly string[];
  /** Há um proxy na frente (túnel, balanceador); o IP real vem do cabeçalho `X-Forwarded-For`. */
  readonly trustProxy: boolean;
  /** Usuário e senha do painel; `null` quando faltam. Vêm só do ambiente, nunca de arquivo do projeto. */
  readonly adminCredentials: AdminCredentials | null;
}

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Configuração do servidor a partir das variáveis de ambiente e dos argumentos (os argumentos valem sobre o ambiente):
 *
 * | Variável         | Argumento     | Padrão        |
 * | ---------------- | ------------- | ------------- |
 * | HOST             | --lan         | 127.0.0.1     |
 * | PORT             | --port N      | 8787          |
 * | DATA_DIR         |               | server-data   |
 * | ALLOWED_ORIGINS  |               | (nenhuma)     |
 * | TRUST_PROXY      |               | desligado     |
 * | ADMIN_USERNAME e ADMIN_PASSWORD |  | painel desligado |
 */
export function readServerConfig(environment: Environment, args: readonly string[]): ServerConfig {
  const adminUsername = environment.ADMIN_USERNAME ?? '';
  const adminPassword = environment.ADMIN_PASSWORD ?? '';
  return {
    host: args.includes('--lan') ? ALL_INTERFACES_ADDRESS : environment.HOST?.trim() || LOOPBACK_ADDRESS,
    port: readPort(environment, args),
    dataDirectory: environment.DATA_DIR?.trim() || DEFAULT_DATA_DIRECTORY,
    allowedOrigins: parseAllowedOrigins(environment.ALLOWED_ORIGINS ?? ''),
    trustProxy: ['1', 'true'].includes((environment.TRUST_PROXY ?? '').trim().toLowerCase()),
    adminCredentials: adminUsername && adminPassword ? { username: adminUsername, password: adminPassword } : null,
  };
}

function readPort(environment: Environment, args: readonly string[]): number {
  const position = args.indexOf('--port');
  const fromArgument = position >= 0 ? (args[position + 1] ?? '') : undefined;
  const text = (fromArgument ?? environment.PORT ?? String(DEFAULT_SERVER_PORT)).trim();
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Porta inválida: "${text}" (use de 1 a 65535).`);
  }
  return port;
}
