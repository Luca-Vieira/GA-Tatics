import { validateGameContent, type GameContent } from '@data/schemas/content';
import { patchNoteSchema, type PatchNote } from '@data/schemas/patchNote';

/** Quanto esperar pelo servidor antes de mostrar o conteúdo que veio com o jogo. */
const DEFAULT_TIMEOUT_MS = 2500;

export interface PublicData {
  /** `null` se o servidor mandou um conteúdo que este jogo não aceita. */
  readonly content: GameContent | null;
  readonly patchNotes: readonly PatchNote[];
}

/**
 * Busca o que um servidor publica sem precisar conectar: o conteúdo e as notas de atualização. Devolve `null` se o
 * servidor não responder a tempo ou não tiver essa rota (versão antiga).
 */
export async function fetchPublicData(httpBaseUrl: string, timeoutMs: number = DEFAULT_TIMEOUT_MS, request: typeof fetch = fetch): Promise<PublicData | null> {
  try {
    const response = await request(`${httpBaseUrl}/api/content`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { content?: unknown; patchNotes?: unknown };
    const validation = validateGameContent(body.content);
    const rawNotes = Array.isArray(body.patchNotes) ? body.patchNotes : [];
    const patchNotes = rawNotes.flatMap((note) => {
      const parsed = patchNoteSchema.safeParse(note);
      return parsed.success ? [parsed.data] : [];
    });
    return { content: validation.ok ? validation.content : null, patchNotes };
  } catch {
    return null;
  }
}

/** Só o conteúdo; `null` quando não dá para usar o do servidor. */
export async function fetchPublicContent(httpBaseUrl: string, timeoutMs?: number, request?: typeof fetch): Promise<GameContent | null> {
  return (await fetchPublicData(httpBaseUrl, timeoutMs, request))?.content ?? null;
}
