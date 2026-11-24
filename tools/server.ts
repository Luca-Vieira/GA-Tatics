/**
 * Servidor da partida em rede.
 *
 * Uso:
 *   npm run server                       só esta máquina conecta (127.0.0.1:8787)
 *   npm run server -- --lan              qualquer máquina da rede local conecta
 *   npm run server -- --port 9000
 *
 * Configuração por variáveis de ambiente (para publicar): HOST, PORT, DATA_DIR, ALLOWED_ORIGINS, TRUST_PROXY,
 * ADMIN_USERNAME e ADMIN_PASSWORD. A tabela está em `src/multiplayer/host/serverConfig.ts` e o passo a passo em
 * `docs/hospedagem-do-servidor.md`.
 *
 * O servidor não tem login de jogador: quem alcança o servidor (e, no navegador, vem de uma origem liberada) consegue
 * criar salas e jogar.
 */
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { ContentStore } from '../src/multiplayer/host/contentStore';
import { GameServer } from '../src/multiplayer/host/GameServer';
import { ALL_INTERFACES_ADDRESS, readServerConfig, type ServerConfig } from '../src/multiplayer/host/serverConfig';
import { SpriteStore } from '../src/multiplayer/host/spriteStore';

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

/** O que a pessoa precisa saber ao ligar o servidor. Nunca mostra a senha do painel. */
function describeStartup(config: ServerConfig, port: number): void {
  console.log(`Servidor do Merge do Escritório no ar (porta ${port}). Saúde: http://127.0.0.1:${port}/health`);
  console.log(`Dados (conteúdo e sprites): ${resolve(config.dataDirectory)}`);
  const origins = config.allowedOrigins.length > 0 ? config.allowedOrigins.join(', ') : 'nenhuma (só páginas locais ou de rede privada)';
  console.log(`Origens liberadas além das locais: ${origins}`);
  if (config.trustProxy) {
    console.log('Proxy confiável ligado: o IP de quem conecta vem de X-Forwarded-For. Use só se o servidor estiver mesmo atrás de um proxy.');
  }
  if (config.host === ALL_INTERFACES_ADDRESS) {
    console.log('Aceita conexões de qualquer máquina que alcance a porta. Não há login de jogador nem HTTPS próprio.');
    lanAddresses().forEach((address) => console.log(`  ws://${address}:${port}`));
  } else {
    console.log(`Escuta só em ${config.host}: ws://${config.host}:${port}  (use --lan ou HOST=0.0.0.0 para abrir)`);
  }
}

const config = readServerConfig(process.env, process.argv.slice(2));
const log = (line: string) => console.log(line);
const server = new GameServer({
  host: config.host,
  port: config.port,
  log,
  contentStore: new ContentStore({ filePath: resolve(config.dataDirectory, 'content.json'), log }),
  spriteStore: new SpriteStore(resolve(config.dataDirectory, 'sprites')),
  allowedOrigins: config.allowedOrigins,
  trustProxy: config.trustProxy,
  adminCredentials: config.adminCredentials,
});

const { port } = await server.start();
describeStartup(config, port);

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
