/**
 * Servidor da partida em rede.
 *
 * Uso:
 *   npm run server                       só esta máquina conecta (127.0.0.1:8787)
 *   npm run server -- --lan              qualquer máquina da rede local conecta
 *   npm run server -- --port 9000
 *
 * Painel de administração (opcional): defina ADMIN_USERNAME e ADMIN_PASSWORD (ao menos 8 caracteres) no ambiente
 * antes de subir o servidor. Sem eles o painel fica desligado. O conteúdo editado fica em server-data/content.json.
 *
 * O servidor não tem login: quem alcança a porta consegue criar salas e jogar. Use --lan só em rede de confiança.
 */
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { ContentStore } from '../src/multiplayer/host/contentStore';
import { SpriteStore } from '../src/multiplayer/host/spriteStore';
import { DEFAULT_PORT, GameServer, LOOPBACK_HOST } from '../src/multiplayer/host/GameServer';

const ALL_INTERFACES_HOST = '0.0.0.0';

function readPort(): number {
  const position = process.argv.indexOf('--port');
  if (position < 0) {
    return DEFAULT_PORT;
  }
  const port = Number(process.argv[position + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Valor inválido para --port (use de 1 a 65535).');
  }
  return port;
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

const isLanMode = process.argv.includes('--lan');
const log = (line: string) => console.log(line);
const contentStore = new ContentStore({ filePath: resolve('server-data', 'content.json'), log });
const adminUsername = process.env.ADMIN_USERNAME ?? '';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const server = new GameServer({
  host: isLanMode ? ALL_INTERFACES_HOST : LOOPBACK_HOST,
  port: readPort(),
  log,
  contentStore,
  spriteStore: new SpriteStore(resolve('server-data', 'sprites')),
  adminCredentials: adminUsername && adminPassword ? { username: adminUsername, password: adminPassword } : null,
});

const { port } = await server.start();
console.log(`Servidor do Merge do Escritório no ar (porta ${port}).`);
if (isLanMode) {
  console.log('Modo rede: aceita conexões de qualquer máquina da rede local. Não há login; use só em rede de confiança.');
  lanAddresses().forEach((address) => console.log(`  ws://${address}:${port}`));
} else {
  console.log(`Só esta máquina conecta: ws://${LOOPBACK_HOST}:${port}  (use --lan para abrir para a rede)`);
}

let isStopping = false;
async function shutDown(): Promise<void> {
  if (isStopping) {
    return;
  }
  isStopping = true;
  console.log('Encerrando o servidor...');
  await server.stop();
  process.exit(0);
}
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
