import type { PatchNote } from '@data/schemas/patchNote';
import type { ReleaseNote } from '@data/releaseNotes';

export type NewsSource = 'game' | 'server';

/** Uma entrada da tela "Novidades". */
export interface NewsEntry {
  readonly source: NewsSource;
  /** Dia no formato AAAA-MM-DD. */
  readonly date: string;
  readonly title: string;
  readonly lines: readonly string[];
  /** Só nas notas publicadas no servidor (o painel usa para apagar). */
  readonly noteId?: string;
}

/** Junta as atualizações do jogo com as notas publicadas no servidor, das mais novas para as mais antigas. */
export function buildNewsFeed(releaseNotes: readonly ReleaseNote[], patchNotes: readonly PatchNote[]): NewsEntry[] {
  const fromGame = releaseNotes.map((note) => ({ sortKey: note.date, entry: { source: 'game' as const, date: note.date, title: note.title, lines: note.changes } }));
  const fromServer = patchNotes.map((note) => ({
    sortKey: note.publishedAt,
    entry: {
      source: 'server' as const,
      noteId: note.id,
      date: note.publishedAt.slice(0, 10),
      title: note.title,
      lines: note.text
        .split('\n')
        .map((line) => line.replace(/^\s*[-•]\s*/, '').trim())
        .filter((line) => line.length > 0),
    },
  }));
  return [...fromGame, ...fromServer].sort((first, second) => second.sortKey.localeCompare(first.sortKey)).map(({ entry }) => entry);
}

/** "2026-11-28" → "28/11/2026". */
export function formatNewsDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
