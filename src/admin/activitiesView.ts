/** Aba "Em andamento": as salas abertas no servidor, com a opção de encerrá-las. */
import type { LiveActivity } from '@multiplayer/host/liveActivities';
import { AdminRequestError, type AdminClient } from './adminClient';
import { actionButton, el } from './dom';

const REFRESH_INTERVAL_MS = 5000;

export interface ActivitiesViewContext {
  readonly client: AdminClient;
  /** A sessão expirou: o painel volta para a tela de entrada. */
  readonly onSessionExpired: (message: string) => void;
}

export function activityStatusText(activity: LiveActivity): string {
  if (activity.status === 'lobby') {
    return 'Em espera';
  }
  return activity.round === null ? 'Em jogo' : `Em jogo · rodada ${activity.round}`;
}

export function activityPeopleText(activity: LiveActivity): string {
  const players = activity.playerNames.length > 0 ? activity.playerNames.join(', ') : 'sem jogadores';
  const spectators = activity.spectatorCount === 1 ? '1 espectador' : `${activity.spectatorCount} espectadores`;
  return `Jogadores: ${players} · ${spectators}`;
}

export function renderActivitiesView(context: ActivitiesViewContext): HTMLElement {
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
      const activities = await context.client.fetchActivities();
      message.className = 'muted';
      message.textContent = activities.length === 0 ? 'Não há salas abertas agora.' : `${activities.length} sala(s) aberta(s). A lista se atualiza sozinha.`;
      list.replaceChildren(...activities.map((activity) => renderActivity(activity, () => void endActivity(activity))));
    } catch (failure) {
      list.replaceChildren();
      showError(failure);
    }
  };

  const endActivity = async (activity: LiveActivity) => {
    const question = `Encerrar a sala ${activity.roomCode} (${activityStatusText(activity).toLowerCase()})? Quem está nela é desconectado da partida, e não dá para desfazer.`;
    if (!window.confirm(question)) return;
    try {
      const ended = await context.client.endActivity(activity.roomCode);
      await refresh();
      if (!ended) message.textContent = `A sala ${activity.roomCode} já não existia.`;
    } catch (failure) {
      showError(failure);
    }
  };

  const container = el('div', {}, [
    el('div', { className: 'note', text: 'Salas em espera ou em jogo neste servidor. Encerrar uma sala avisa quem está nela.' }),
    el('div', { className: 'row spaced' }, [actionButton('Atualizar', () => void refresh(), 'quiet'), message]),
    list,
  ]);

  void refresh();
  // A atualização automática para quando a aba é trocada (a lista sai da página).
  const timer = window.setInterval(() => {
    if (!container.isConnected) {
      window.clearInterval(timer);
      return;
    }
    void refresh();
  }, REFRESH_INTERVAL_MS);
  return container;
}

function renderActivity(activity: LiveActivity, onEnd: () => void): HTMLElement {
  return el('div', { className: 'effect row between' }, [
    el('div', {}, [
      el('strong', { text: `Sala ${activity.roomCode} — ${activityStatusText(activity)}` }),
      el('div', { className: 'muted', text: activityPeopleText(activity) }),
    ]),
    actionButton('Encerrar', onEnd, 'danger'),
  ]);
}
