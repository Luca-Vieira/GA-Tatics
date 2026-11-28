import { validateGameContent, type GameContent } from '@data/schemas/content';
import type { PatchNote, PatchNoteInput } from '@data/schemas/patchNote';
import { fetchPublicData } from '@multiplayer/client/publicContent';
import type { LiveActivity } from '@multiplayer/host/liveActivities';

export interface PublishedContent {
  readonly version: number;
  readonly content: GameContent;
}

export type PublishResult =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly kind: 'conflict' | 'invalid' | 'unauthorized' | 'failed'; readonly message: string; readonly issues: readonly string[] };

export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly kind: 'unauthorized' | 'locked' | 'disabled' | 'unreachable' | 'failed',
  ) {
    super(message);
  }
}

type Fetcher = typeof fetch;

/** Fala com a API do painel de administração do servidor. O token fica só na memória desta página. */
export class AdminClient {
  private token: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  get isLoggedIn(): boolean {
    return this.token !== null;
  }

  async login(username: string, password: string): Promise<void> {
    const response = await this.send('POST', '/api/admin/login', { username, password });
    const body = (await response.json().catch(() => ({}))) as { token?: unknown; error?: string };
    if (response.status === 200 && typeof body.token === 'string') {
      this.token = body.token;
      return;
    }
    if (response.status === 401) {
      throw new AdminRequestError('Usuário ou senha incorretos.', 'unauthorized');
    }
    if (response.status === 429) {
      throw new AdminRequestError('Muitas tentativas. Espere um minuto e tente de novo.', 'locked');
    }
    if (response.status === 503) {
      throw new AdminRequestError('O painel está desligado neste servidor (falta configurar o usuário e a senha do administrador).', 'disabled');
    }
    throw new AdminRequestError(`O servidor recusou o login (${response.status}).`, 'failed');
  }

  async logout(): Promise<void> {
    if (this.token) {
      await this.send('POST', '/api/admin/logout', undefined).catch(() => undefined);
    }
    this.token = null;
  }

  async fetchContent(): Promise<PublishedContent> {
    const response = await this.send('GET', '/api/admin/content', undefined);
    if (response.status === 401) {
      this.token = null;
      throw new AdminRequestError('A sessão expirou. Entre de novo.', 'unauthorized');
    }
    const body = (await response.json().catch(() => ({}))) as { version?: unknown; content?: unknown };
    const validation = validateGameContent(body.content);
    if (response.status !== 200 || typeof body.version !== 'number' || !validation.ok) {
      throw new AdminRequestError('Não foi possível ler o conteúdo do servidor.', 'failed');
    }
    return { version: body.version, content: validation.content };
  }

  /** Sem `note`, publica em silêncio (sem entrada nas "Novidades" do jogo). */
  async publish(baseVersion: number, content: GameContent, note?: PatchNoteInput): Promise<PublishResult> {
    const response = await this.send('PUT', '/api/admin/content', { baseVersion, content, ...(note ? { note } : {}) });
    const body = (await response.json().catch(() => ({}))) as { version?: unknown; error?: string; details?: { issues?: string[] } };
    if (response.status === 200 && typeof body.version === 'number') {
      return { ok: true, version: body.version };
    }
    if (response.status === 401) {
      this.token = null;
      return { ok: false, kind: 'unauthorized', message: 'A sessão expirou. Entre de novo.', issues: [] };
    }
    if (response.status === 409) {
      return { ok: false, kind: 'conflict', message: 'Outra pessoa publicou alterações depois que você abriu o painel. Recarregue do servidor antes de publicar.', issues: [] };
    }
    if (response.status === 422) {
      return { ok: false, kind: 'invalid', message: 'O servidor recusou o conteúdo.', issues: body.details?.issues ?? [] };
    }
    return { ok: false, kind: 'failed', message: `O servidor não aceitou a publicação (${response.status}).`, issues: [] };
  }

  /**
   * As notas publicadas, pela mesma rota pública que o jogo usa. O pedido vai sem o token: a rota não pede login, e um
   * cabeçalho a mais faria o navegador exigir uma liberação (CORS) que ela não oferece.
   */
  async fetchPatchNotes(): Promise<readonly PatchNote[]> {
    const published = await fetchPublicData(this.baseUrl, undefined, this.fetcher);
    if (!published) {
      throw new AdminRequestError('Não foi possível ler as notas. Confira se o servidor está ligado e atualizado.', 'failed');
    }
    return published.patchNotes;
  }

  /** Apaga uma nota publicada. Devolve falso se ela já não existia. */
  async deletePatchNote(noteId: string): Promise<boolean> {
    const response = await this.send('POST', `/api/admin/notes/${encodeURIComponent(noteId)}/delete`, undefined);
    if (response.status === 200 || response.status === 404) {
      return response.status === 200;
    }
    if (response.status === 401) {
      this.token = null;
      throw new AdminRequestError('A sessão expirou. Entre de novo.', 'unauthorized');
    }
    throw new AdminRequestError(`O servidor não apagou a nota (${response.status}).`, 'failed');
  }

  /** Salas em espera ou em jogo no servidor. */
  async fetchActivities(): Promise<readonly LiveActivity[]> {
    const response = await this.send('GET', '/api/admin/activities', undefined);
    const body = (await response.json().catch(() => ({}))) as { activities?: unknown };
    if (response.status === 200 && Array.isArray(body.activities)) {
      return body.activities as LiveActivity[];
    }
    throw this.activityErrorOf(response.status);
  }

  /** Encerra a sala. Devolve falso se ela já não existia. */
  async endActivity(roomCode: string): Promise<boolean> {
    const response = await this.send('POST', `/api/admin/activities/${encodeURIComponent(roomCode)}/end`, undefined);
    if (response.status === 200) {
      return true;
    }
    if (response.status === 404) {
      const body = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (body.error === 'activity_not_found') {
        return false;
      }
    }
    throw this.activityErrorOf(response.status);
  }

  private activityErrorOf(status: number): AdminRequestError {
    if (status === 401) {
      this.token = null;
      return new AdminRequestError('A sessão expirou. Entre de novo.', 'unauthorized');
    }
    if (status === 404 || status === 501) {
      return new AdminRequestError('Este servidor não permite ver nem encerrar as salas em andamento. Confira se ele está atualizado.', 'failed');
    }
    return new AdminRequestError(`O servidor não atendeu ao pedido (${status}).`, 'failed');
  }

  /** Envia o PNG de um personagem ou de um sprite auxiliar e devolve o caminho público do arquivo no servidor. */
  async uploadSprite(spriteId: string, png: Uint8Array): Promise<string> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/api/admin/sprites/${encodeURIComponent(spriteId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: png as BodyInit,
      });
    } catch {
      throw new AdminRequestError('Não foi possível falar com o servidor. Confira o endereço e se ele está ligado.', 'unreachable');
    }
    const body = (await response.json().catch(() => ({}))) as { path?: unknown };
    if (response.status === 200 && typeof body.path === 'string') {
      return body.path;
    }
    if (response.status === 401) {
      this.token = null;
      throw new AdminRequestError('A sessão expirou. Entre de novo.', 'unauthorized');
    }
    if (response.status === 413) {
      throw new AdminRequestError('A imagem passa de 1 MB.', 'failed');
    }
    if (response.status === 422) {
      throw new AdminRequestError('O servidor recusou o arquivo: precisa ser um PNG íntegro de até 1024×1024 pixels.', 'failed');
    }
    throw new AdminRequestError(`O servidor não aceitou o sprite (${response.status}).`, 'failed');
  }

  private async send(method: string, path: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new AdminRequestError('Não foi possível falar com o servidor. Confira o endereço e se ele está ligado.', 'unreachable');
    }
  }
}
