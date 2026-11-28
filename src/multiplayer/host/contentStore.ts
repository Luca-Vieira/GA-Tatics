import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { validateGameContent, type GameContent } from '@data/schemas/content';
import { MAXIMUM_PATCH_NOTES, patchNoteInputSchema, patchNoteSchema, type PatchNote } from '@data/schemas/patchNote';

/** O conteúdo vigente e o número da versão (sobe a cada publicação). */
export interface ContentSnapshot {
  readonly version: number;
  readonly content: GameContent;
}

export type ContentUpdateResult = { readonly ok: true; readonly version: number } | { readonly ok: false; readonly issues: readonly string[] };

export interface ContentStoreOptions {
  /** Arquivo onde o conteúdo editado fica guardado no servidor. Sem ele, o conteúdo só existe em memória. */
  readonly filePath?: string;
  readonly log?: (line: string) => void;
  /** Relógio usado para datar as notas (injetável nos testes). */
  readonly nowMs?: () => number;
}

const INITIAL_VERSION = 1;

/**
 * Guarda o conteúdo do jogo no servidor (arquivo JSON). Só aceita conteúdo que passa na validação completa, grava
 * de forma atômica (arquivo temporário + renomear) e avisa quem estiver ouvindo quando algo é publicado.
 * Partidas em andamento não são afetadas: cada partida guarda o conteúdo com que foi criada.
 */
export class ContentStore {
  private current: ContentSnapshot = { version: INITIAL_VERSION, content: DEFAULT_GAME_CONTENT };
  /** Notas de atualização publicadas, da mais nova para a mais antiga. */
  private notes: readonly PatchNote[] = [];
  private readonly nowMs: () => number;
  private readonly filePath: string | undefined;
  private readonly log: (line: string) => void;
  private readonly changeHandlers = new Set<(snapshot: ContentSnapshot) => void>();

  constructor(options: ContentStoreOptions = {}) {
    this.filePath = options.filePath;
    this.log = options.log ?? (() => undefined);
    this.nowMs = options.nowMs ?? Date.now;
    this.loadFromFile();
  }

  get snapshot(): ContentSnapshot {
    return this.current;
  }

  get patchNotes(): readonly PatchNote[] {
    return this.notes;
  }

  /** Apaga uma nota publicada por engano. Devolve falso se ela não existir. */
  removePatchNote(noteId: string): boolean {
    const remaining = this.notes.filter((note) => note.id !== noteId);
    if (remaining.length === this.notes.length) {
      return false;
    }
    this.persist(this.current, remaining);
    this.notes = remaining;
    return true;
  }

  /**
   * Publica um conteúdo novo. `baseVersion` evita sobrescrever, sem querer, o que outra pessoa publicou depois
   * de a tela ser aberta: se não for a versão vigente, nada é gravado.
   */
  update(raw: unknown, extraIssuesOf?: (content: GameContent) => readonly string[], rawNote?: unknown): ContentUpdateResult {
    const validation = validateGameContent(raw);
    if (!validation.ok) {
      return { ok: false, issues: validation.issues };
    }
    const extraIssues = extraIssuesOf?.(validation.content) ?? [];
    if (extraIssues.length > 0) {
      return { ok: false, issues: extraIssues };
    }
    const parsedNote = rawNote === undefined ? undefined : patchNoteInputSchema.safeParse(rawNote);
    if (parsedNote && !parsedNote.success) {
      return { ok: false, issues: parsedNote.error.issues.map((issue) => `nota de atualização: ${issue.message}`) };
    }
    const next: ContentSnapshot = { version: this.current.version + 1, content: validation.content };
    const nextNotes = parsedNote ? [this.createNote(parsedNote.data, next.version), ...this.notes].slice(0, MAXIMUM_PATCH_NOTES) : this.notes;
    this.persist(next, nextNotes);
    this.current = next;
    this.notes = nextNotes;
    this.changeHandlers.forEach((handler) => handler(next));
    return { ok: true, version: next.version };
  }

  onChange(handler: (snapshot: ContentSnapshot) => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  private createNote(input: { readonly title: string; readonly text: string }, contentVersion: number): PatchNote {
    const publishedAtMs = this.nowMs();
    return { ...input, id: `${contentVersion}-${publishedAtMs}`, publishedAt: new Date(publishedAtMs).toISOString(), contentVersion };
  }

  private loadFromFile(): void {
    if (!this.filePath) {
      return;
    }
    let text: string;
    try {
      text = readFileSync(this.filePath, 'utf8');
    } catch {
      this.log(`Sem arquivo de conteúdo em ${this.filePath}; usando o conteúdo padrão.`);
      return;
    }
    try {
      const stored = JSON.parse(text) as { version?: unknown; content?: unknown; patchNotes?: unknown };
      const validation = validateGameContent(stored.content);
      if (!validation.ok || typeof stored.version !== 'number' || !Number.isInteger(stored.version) || stored.version < INITIAL_VERSION) {
        this.log(`O arquivo de conteúdo ${this.filePath} é inválido; usando o conteúdo padrão (o arquivo só será trocado na próxima publicação).`);
        return;
      }
      this.current = { version: stored.version, content: validation.content };
      // Uma nota estragada some sozinha, sem derrubar o conteúdo.
      const storedNotes = Array.isArray(stored.patchNotes) ? stored.patchNotes : [];
      this.notes = storedNotes.flatMap((note) => {
        const parsed = patchNoteSchema.safeParse(note);
        return parsed.success ? [parsed.data] : [];
      });
      this.log(`Conteúdo carregado de ${this.filePath} (versão ${stored.version}).`);
    } catch {
      this.log(`Não foi possível ler ${this.filePath}; usando o conteúdo padrão.`);
    }
  }

  private persist(snapshot: ContentSnapshot, patchNotes: readonly PatchNote[]): void {
    if (!this.filePath) {
      return;
    }
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ version: snapshot.version, content: snapshot.content, patchNotes }, null, 2), 'utf8');
    renameSync(temporaryPath, this.filePath);
  }
}
