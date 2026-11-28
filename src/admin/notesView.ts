/** Publicação com ou sem nota, e a aba "Notas" com o que os jogadores veem em "Novidades". */
import { buildNewsFeed, formatNewsDate } from '@core/news/newsFeed';
import { RELEASE_NOTES } from '@data/releaseNotes';
import { MAXIMUM_PATCH_NOTE_TEXT_LENGTH, MAXIMUM_PATCH_NOTE_TITLE_LENGTH, patchNoteInputSchema, type PatchNote, type PatchNoteInput } from '@data/schemas/patchNote';
import { AdminRequestError, type AdminClient } from './adminClient';
import { actionButton, el, field } from './dom';

export interface PublishPanelContext {
  /** Rascunho da nota (uma linha por mudança), para a pessoa revisar. */
  readonly suggestedLines: readonly string[];
  readonly publish: (note?: PatchNoteInput) => void;
  readonly cancel: () => void;
}

const DEFAULT_NOTE_TITLE = 'Ajustes no jogo';

export function renderPublishPanel(context: PublishPanelContext): HTMLElement {
  const title = el('input', { type: 'text', value: DEFAULT_NOTE_TITLE, attributes: { maxlength: String(MAXIMUM_PATCH_NOTE_TITLE_LENGTH) } });
  const text = el('textarea', { value: context.suggestedLines.join('\n'), attributes: { maxlength: String(MAXIMUM_PATCH_NOTE_TEXT_LENGTH) } });
  text.className = 'small-area import-area';
  const error = el('div', { className: 'error' });
  const publishWithNote = () => {
    const parsed = patchNoteInputSchema.safeParse({ title: title.value, text: text.value });
    if (!parsed.success) {
      error.textContent = parsed.error.issues.map((issue) => issue.message).join(' ');
      return;
    }
    context.publish(parsed.data);
  };
  return el('div', { className: 'effect' }, [
    el('h2', { text: 'Publicar' }),
    el('div', { className: 'note', text: 'Com nota, os jogadores a veem em "Novidades". O texto abaixo foi montado a partir do que mudou: revise antes de publicar (uma mudança por linha).' }),
    field('Título da nota', title),
    field('O que mudou', text),
    error,
    el('div', { className: 'row' }, [
      actionButton('Publicar com nota', publishWithNote, 'good'),
      actionButton('Publicar sem nota', () => context.publish(), ''),
      actionButton('Cancelar', context.cancel, 'quiet'),
    ]),
  ]);
}

export interface NotesViewContext {
  readonly client: AdminClient;
  readonly onSessionExpired: (message: string) => void;
}

export function renderNotesView(context: NotesViewContext): HTMLElement {
  const list = el('div', { className: 'effects' });
  const message = el('div', { className: 'muted', text: 'Carregando…' });
  const showError = (failure: unknown) => {
    if (failure instanceof AdminRequestError && failure.kind === 'unauthorized') {
      context.onSessionExpired(failure.message);
      return;
    }
    message.className = 'error';
    message.textContent = failure instanceof AdminRequestError ? failure.message : 'Não foi possível consultar o servidor.';
  };

  const refresh = async () => {
    try {
      const patchNotes = await context.client.fetchPatchNotes();
      message.className = 'muted';
      message.textContent = patchNotes.length === 0 ? 'Nenhuma nota publicada por este painel ainda.' : `${patchNotes.length} nota(s) publicada(s) por este painel.`;
      list.replaceChildren(...renderEntries(patchNotes, (noteId, title) => void remove(noteId, title)));
    } catch (failure) {
      showError(failure);
    }
  };

  const remove = async (noteId: string, title: string) => {
    if (!window.confirm(`Apagar a nota "${title}"? Ela some das Novidades na hora e não dá para desfazer.`)) return;
    try {
      await context.client.deletePatchNote(noteId);
      await refresh();
    } catch (failure) {
      showError(failure);
    }
  };

  void refresh();
  return el('div', {}, [
    el('div', { className: 'note', text: 'É o que os jogadores veem em "Novidades": as notas deste painel e as atualizações do próprio jogo (que vêm no código e não se apagam por aqui).' }),
    message,
    list,
  ]);
}

function renderEntries(patchNotes: readonly PatchNote[], onRemove: (noteId: string, title: string) => void): HTMLElement[] {
  // A mesma lista que o jogo mostra; só as notas do painel têm o botão de apagar.
  return buildNewsFeed(RELEASE_NOTES, patchNotes).map((entry) => {
    const { noteId } = entry;
    const header = el('div', { className: 'row between' }, [
      el('strong', { text: `${formatNewsDate(entry.date)} · ${entry.title}` }),
      noteId === undefined ? el('span', { className: 'muted', text: 'Atualização do jogo' }) : actionButton('Apagar', () => onRemove(noteId, entry.title), 'danger'),
    ]);
    return el('div', { className: 'effect' }, [header, el('ul', {}, entry.lines.map((line) => el('li', { text: line })))]);
  });
}
