import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminAuth } from './adminAuth';
import type { GameContent } from '@data/schemas/content';
import type { ContentStore } from './contentStore';
import type { LiveActivities } from './liveActivities';
import { MAXIMUM_SPRITE_BYTES, type SpriteStore } from './spriteStore';
import { isOriginAllowed } from './originPolicy';

const LOGIN_BODY_LIMIT_BYTES = 4 * 1024;
const CONTENT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const API_PREFIX = '/api/admin/';
/** Caminhos que existem: com o método errado, respondem 405 em vez de 404. */
const KNOWN_PATHS: readonly string[] = ['/api/admin/login', '/api/admin/logout', '/api/admin/content', '/api/admin/activities'];

export interface AdminApiOptions {
  /** `null`: o painel está desligado (sem usuário e senha configurados). */
  readonly auth: AdminAuth | null;
  readonly store: ContentStore;
  readonly sprites: SpriteStore;
  readonly log: (line: string) => void;
  /** Endereços de páginas publicadas que podem usar o painel (além das locais e de rede privada). */
  readonly allowedOrigins?: readonly string[];
  /** Há um proxy na frente: o IP de quem tenta entrar vem de `X-Forwarded-For`. */
  readonly trustProxy?: boolean;
  /** Salas do servidor do jogo, para o painel ver e encerrar. Sem isso, as rotas de salas respondem 501. */
  readonly liveActivities?: LiveActivities;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

/**
 * API HTTP do painel de administração:
 *   POST /api/admin/login    { username, password }          → { token, expiresInSeconds }
 *   POST /api/admin/logout                                    (com o token)
 *   GET  /api/admin/content                                   → { version, content }
 *   PUT  /api/admin/content  { baseVersion, content, note? } → { version }   (note: { title, text })
 *   POST /api/admin/notes/<id>/delete                         → { ok: true } (404 se a nota não existir)
 *   PUT  /api/admin/sprites/<id do sprite>       (corpo: o PNG, Content-Type image/png) → { path }
 *   GET  /api/admin/activities                                → { activities: [ salas em espera ou em jogo ] }
 *   POST /api/admin/activities/<código da sala>/end           → { ok: true } (404 se a sala não existir)
 * O token vai no cabeçalho `Authorization: Bearer ...` (nunca em cookie, então outra página não consegue agir em nome do admin).
 * Páginas de fora da rede local/privada são recusadas.
 */
export class AdminApi {
  constructor(private readonly options: AdminApiOptions) {}

  /** Trata a requisição se ela for da API; devolve `false` para as demais. */
  handle(request: IncomingMessage, response: ServerResponse): boolean {
    const path = (request.url ?? '').split('?')[0] ?? '';
    if (!path.startsWith(API_PREFIX)) {
      return false;
    }
    this.respond(request, response, path).catch((error: unknown) => {
      if (error instanceof HttpError) {
        this.sendJson(request, response, error.status, { error: error.code, details: error.details });
        return;
      }
      this.options.log(`Erro na API do administrador: ${error instanceof Error ? error.message : String(error)}`);
      this.sendJson(request, response, 500, { error: 'internal_error' });
    });
    return true;
  }

  private async respond(request: IncomingMessage, response: ServerResponse, path: string): Promise<void> {
    const origin = request.headers.origin;
    if (origin !== undefined && !isOriginAllowed(origin, this.options.allowedOrigins)) {
      throw new HttpError(403, 'origin_not_allowed');
    }
    if (request.method === 'OPTIONS') {
      this.sendJson(request, response, 204, undefined);
      return;
    }
    const { auth } = this.options;
    if (!auth) {
      throw new HttpError(503, 'admin_disabled');
    }

    const spriteMatch = /^\/api\/admin\/sprites\/([^/]+)$/.exec(path);
    if (spriteMatch && request.method === 'PUT') {
      this.requireSession(request, auth);
      await this.uploadSprite(request, response, decodeURIComponent(spriteMatch[1] as string));
      return;
    }

    const endMatch = /^\/api\/admin\/activities\/([A-Za-z0-9]{1,16})\/end$/.exec(path);
    if (endMatch && request.method === 'POST') {
      this.requireSession(request, auth);
      this.endActivity(request, response, endMatch[1] as string);
      return;
    }

    const noteMatch = /^\/api\/admin\/notes\/([0-9-]{1,40})\/delete$/.exec(path);
    if (noteMatch && request.method === 'POST') {
      this.requireSession(request, auth);
      this.deleteNote(request, response, noteMatch[1] as string);
      return;
    }

    const route = `${request.method} ${path}`;
    switch (route) {
      case 'GET /api/admin/activities':
        this.requireSession(request, auth);
        this.sendJson(request, response, 200, { activities: this.requireLiveActivities().list() });
        return;
      case 'POST /api/admin/login':
        await this.login(request, response, auth);
        return;
      case 'POST /api/admin/logout':
        this.requireSession(request, auth);
        auth.logout(this.tokenOf(request));
        this.sendJson(request, response, 200, { ok: true });
        return;
      case 'GET /api/admin/content': {
        this.requireSession(request, auth);
        const snapshot = this.options.store.snapshot;
        this.sendJson(request, response, 200, { version: snapshot.version, content: snapshot.content });
        return;
      }
      case 'PUT /api/admin/content':
        this.requireSession(request, auth);
        await this.publishContent(request, response);
        return;
      default:
        throw new HttpError(KNOWN_PATHS.includes(path) ? 405 : 404, 'not_found');
    }
  }

  private requireLiveActivities(): LiveActivities {
    const { liveActivities } = this.options;
    if (!liveActivities) {
      throw new HttpError(501, 'activities_unavailable');
    }
    return liveActivities;
  }

  private endActivity(request: IncomingMessage, response: ServerResponse, roomCode: string): void {
    if (!this.requireLiveActivities().end(roomCode)) {
      throw new HttpError(404, 'activity_not_found');
    }
    this.options.log(`Sala ${roomCode} encerrada pelo administrador.`);
    this.sendJson(request, response, 200, { ok: true });
  }

  private deleteNote(request: IncomingMessage, response: ServerResponse, noteId: string): void {
    if (!this.options.store.removePatchNote(noteId)) {
      throw new HttpError(404, 'note_not_found');
    }
    this.options.log(`Nota de atualização ${noteId} apagada pelo administrador.`);
    this.sendJson(request, response, 200, { ok: true });
  }

  private async login(request: IncomingMessage, response: ServerResponse, auth: AdminAuth): Promise<void> {
    const body = await this.readJsonBody(request, LOGIN_BODY_LIMIT_BYTES);
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const result = auth.login(username, password, this.clientAddressOf(request));
    if (!result.ok) {
      if (result.reason === 'locked') {
        throw new HttpError(429, 'too_many_attempts');
      }
      this.options.log('Tentativa de login do administrador recusada.');
      throw new HttpError(401, 'invalid_credentials');
    }
    this.options.log('Administrador entrou no painel.');
    this.sendJson(request, response, 200, { token: result.token, expiresInSeconds: result.expiresInSeconds });
  }

  private async publishContent(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJsonBody(request, CONTENT_BODY_LIMIT_BYTES);
    const { store } = this.options;
    if (body.baseVersion !== store.snapshot.version) {
      throw new HttpError(409, 'version_conflict', { currentVersion: store.snapshot.version });
    }
    const result = store.update(body.content, (content) => this.missingSpriteIssues(content), body.note);
    if (!result.ok) {
      throw new HttpError(422, 'invalid_content', { issues: result.issues });
    }
    this.options.log(`Conteúdo publicado pelo administrador (versão ${result.version}).`);
    this.sendJson(request, response, 200, { version: result.version });
  }

  private async uploadSprite(request: IncomingMessage, response: ServerResponse, spriteId: string): Promise<void> {
    if ((request.headers['content-type'] ?? '').toLowerCase().split(';')[0]?.trim() !== 'image/png') {
      throw new HttpError(415, 'png_required');
    }
    const bytes = await this.readBody(request, MAXIMUM_SPRITE_BYTES);
    const result = this.options.sprites.save(spriteId, bytes);
    if (!result.ok) {
      const status = result.error === 'too_large' ? 413 : result.error === 'invalid_character_id' ? 400 : 422;
      throw new HttpError(status, result.error);
    }
    this.options.log(`Sprite enviado pelo administrador para ${spriteId} (${result.path}).`);
    this.sendJson(request, response, 200, { path: result.path });
  }

  /** Todo sprite citado pelo conteúdo precisa existir no servidor, senão os jogadores veriam a imagem quebrada. */
  private missingSpriteIssues(content: Pick<GameContent, 'characters' | 'auxiliarySprites' | 'maps'>): string[] {
    const citedSprites = [
      ...content.characters.map((character, position) => ({ at: `characters.${position}.sprite.path`, path: character.sprite?.path })),
      ...Object.entries(content.auxiliarySprites).map(([key, sprite]) => ({ at: `auxiliarySprites.${key}.path`, path: sprite.path })),
      ...content.maps.map((map, position) => ({ at: `maps.${position}.background.path`, path: map.background.type === 'image' ? map.background.path : undefined })),
    ];
    return citedSprites
      .filter(({ path }) => path !== undefined && !this.options.sprites.has(path))
      .map(({ at }) => `${at}: o sprite não foi enviado a este servidor.`);
  }

  // --- Apoio --------------------------------------------------------------------------------------

  /**
   * De onde vem a tentativa de login, para limitar por endereço. Atrás de um proxy confiável vale o **último** item de
   * `X-Forwarded-For` (o que o próprio proxy acrescentou; os anteriores podem ser inventados por quem chama).
   */
  private clientAddressOf(request: IncomingMessage): string {
    if (this.options.trustProxy) {
      const header = request.headers['x-forwarded-for'];
      const forwarded = (Array.isArray(header) ? header.join(',') : (header ?? '')).split(',').pop()?.trim();
      if (forwarded) {
        return forwarded;
      }
    }
    return request.socket.remoteAddress ?? 'desconhecido';
  }

  private tokenOf(request: IncomingMessage): string | undefined {
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  }

  private requireSession(request: IncomingMessage, auth: AdminAuth): void {
    if (!auth.isValid(this.tokenOf(request))) {
      throw new HttpError(401, 'unauthorized');
    }
  }

  private async readBody(request: IncomingMessage, limitBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of request) {
      const part = chunk as Buffer;
      received += part.length;
      if (received > limitBytes) {
        throw new HttpError(413, 'body_too_large');
      }
      chunks.push(part);
    }
    return Buffer.concat(chunks);
  }

  private async readJsonBody(request: IncomingMessage, limitBytes: number): Promise<Record<string, unknown>> {
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      throw new HttpError(415, 'json_required');
    }
    const body = await this.readBody(request, limitBytes);
    try {
      const parsed: unknown = JSON.parse(body.toString('utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new HttpError(400, 'invalid_json');
    }
  }

  private sendJson(request: IncomingMessage, response: ServerResponse, status: number, body: unknown): void {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    const origin = request.headers.origin;
    if (origin !== undefined && isOriginAllowed(origin, this.options.allowedOrigins)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS';
      headers.Vary = 'Origin';
    }
    response.writeHead(status, headers);
    response.end(body === undefined ? undefined : JSON.stringify(body));
  }
}
