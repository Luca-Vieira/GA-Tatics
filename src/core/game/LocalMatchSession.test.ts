import { describe, expect, it } from 'vitest';
import { LOCAL_HUMAN_ID, LocalMatchSession } from './LocalMatchSession';
import type { HumanDuel, RoundResultSummary, SessionListener } from './MatchSession';

/** Ouvinte de teste: guarda os avisos na ordem em que chegam. */
function recordEvents(session: LocalMatchSession) {
  const events: string[] = [];
  const duels: (HumanDuel | null)[] = [];
  const summaries: RoundResultSummary[] = [];
  const failures: string[] = [];
  const listener: SessionListener = {
    preparationStarted: () => events.push('preparation'),
    combatStarted: (duel) => {
      events.push('combat');
      duels.push(duel);
    },
    roundConcluded: (summary) => {
      events.push('result');
      summaries.push(summary);
    },
    matchEnded: () => events.push('ended'),
    stateChanged: () => events.push('state'),
    actionFailed: (reason) => failures.push(reason),
    fusionHappened: () => events.push('fusion'),
    connectionLost: () => events.push('lost'),
  };
  session.setListener(listener);
  return { events, duels, summaries, failures };
}

const withoutState = (events: readonly string[]) => events.filter((event) => event !== 'state');

describe('sessão local', () => {
  it('começa na preparação, com o tempo da rodada e as lojas prontas', () => {
    const session = new LocalMatchSession({ seed: 'teste' });
    const { events } = recordEvents(session);
    session.start();
    expect(events).toEqual(['preparation']);
    expect(session.preparationRemainingMs).toBe(session.match.preparationSeconds * 1000);
    expect(session.match.getPlayer(LOCAL_HUMAN_ID).shop.length).toBeGreaterThan(0);
  });

  it('comprar passa pela loja do jogo e avisa a mudança; falhas viram aviso de erro', () => {
    const session = new LocalMatchSession({ seed: 'teste' });
    const { events, failures } = recordEvents(session);
    session.start();
    session.buy(0);
    expect(session.match.getPlayer(LOCAL_HUMAN_ID).units).toHaveLength(1);
    expect(events).toContain('state');

    session.buy(9);
    expect(failures).toEqual(['unknown_shop_slot']);
  });

  it('o tempo esgotado inicia o combate, com o jogador na metade de baixo', () => {
    const session = new LocalMatchSession({ seed: 'teste' });
    const { events, duels } = recordEvents(session);
    session.start();
    session.update(session.match.preparationSeconds * 1000 + 1);
    expect(withoutState(events)).toEqual(['preparation', 'combat']);
    expect(session.preparationRemainingMs).toBe(0);
    // Com quatro jogadores todos têm adversário.
    expect(duels[0]?.bottomId).toBe(LOCAL_HUMAN_ID);
  });

  it('ficar pronto adianta o combate depois de uma pequena pausa, e desfazer cancela', () => {
    const session = new LocalMatchSession({ seed: 'teste' });
    const { events } = recordEvents(session);
    session.start();

    session.setReady(true);
    session.update(100);
    expect(withoutState(events)).toEqual(['preparation']);
    session.setReady(false);
    session.update(1000);
    expect(withoutState(events)).toEqual(['preparation']);

    session.setReady(true);
    session.update(400);
    expect(withoutState(events)).toEqual(['preparation', 'combat']);
  });

  it('só concluir a apresentação aplica o resultado, e continuar abre a rodada seguinte', () => {
    const session = new LocalMatchSession({ seed: 'teste' });
    const { events, summaries } = recordEvents(session);
    session.start();
    session.update(session.match.preparationSeconds * 1000 + 1);
    expect(summaries).toHaveLength(0);

    session.presentationFinished();
    expect(summaries).toHaveLength(1);
    expect(session.match.phase).toBe('result');

    session.continueAfterResult();
    expect(withoutState(events)).toEqual(['preparation', 'combat', 'result', 'preparation']);
    expect(session.match.round).toBe(2);
  });

  it('ignora ações e avisos fora de hora', () => {
    const session = new LocalMatchSession({ seed: 'teste' });
    const { events } = recordEvents(session);
    session.start();
    session.update(session.match.preparationSeconds * 1000 + 1);
    session.buy(0);
    session.setReady(true);
    session.continueAfterResult();
    expect(withoutState(events)).toEqual(['preparation', 'combat']);
    expect(session.match.getPlayer(LOCAL_HUMAN_ID).units).toHaveLength(0);
  });

  it('o jogador que não monta time cai, e a partida termina entre os bots com a colocação final', () => {
    const session = new LocalMatchSession({ seed: 'teste' });
    const { events } = recordEvents(session);
    session.start();
    for (let guard = 0; guard < 40 && !events.includes('ended'); guard++) {
      session.update(session.match.preparationSeconds * 1000 + 1);
      session.presentationFinished();
      session.continueAfterResult();
    }
    expect(events).toContain('ended');
    expect(session.match.isFinished).toBe(true);
    expect(session.match.standings()).toHaveLength(4);
  });
});
