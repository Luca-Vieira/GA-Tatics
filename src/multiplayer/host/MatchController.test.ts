import { describe, expect, it } from 'vitest';
import { makeGame } from '@core/testSupport';
import type { ServerMessage } from '../protocol/serverMessages';
import { MatchController } from './MatchController';
import { ManualScheduler } from './scheduler';

const TEN_MINUTES_MS = 10 * 60 * 1000;

function createMatch(humanIds: readonly string[] = ['p1']) {
  const scheduler = new ManualScheduler();
  const game = makeGame({
    players: [
      ...humanIds.map((id) => ({ id, name: `Humano ${id}`, isBot: false })),
      ...['p1', 'p2', 'p3', 'p4'].filter((id) => !humanIds.includes(id)).map((id) => ({ id, name: `Bot ${id}`, isBot: true })),
    ],
  });
  const received = new Map<string, ServerMessage[]>(humanIds.map((id) => [id, []]));
  let endedCount = 0;
  const controller = new MatchController({
    game,
    humanIds,
    scheduler,
    send: (playerId, message) => received.get(playerId)?.push(message),
    onEnded: () => endedCount++,
  });
  const messagesOf = (playerId: string) => received.get(playerId)!;
  const typesOf = (playerId: string) => messagesOf(playerId).map((message) => message.type);
  return { scheduler, game, controller, messagesOf, typesOf, endedCount: () => endedCount };
}

describe('início da partida no servidor', () => {
  it('avisa quem está jogando, abre a preparação e entrega só a visão do próprio jogador', () => {
    const { controller, messagesOf } = createMatch();
    controller.start();
    const [started, round, view] = messagesOf('p1');
    expect(started).toMatchObject({ type: 'match_started', rotationIndex: 0 });
    expect(round).toMatchObject({ type: 'round_started', round: 1, preparationSeconds: 40, unitLimit: 3 });
    expect(view).toMatchObject({ type: 'player_view', view: { coins: 5, lives: 3, ready: false } });
    expect(JSON.stringify(view)).not.toContain('p2-u');
  });

  it('o que um jogador compra não aparece nas mensagens do outro', () => {
    const { controller, messagesOf } = createMatch(['p1', 'p2']);
    controller.start();
    controller.handleAction('p2', { type: 'buy', shopSlot: 0 });
    expect(JSON.stringify(messagesOf('p2'))).toContain('p2-u1');
    expect(JSON.stringify(messagesOf('p1'))).not.toContain('p2-u1');
  });
});

describe('ações do jogador', () => {
  it('compra pela loja do servidor e devolve o resultado e a visão atualizada', () => {
    const { controller, messagesOf, game } = createMatch();
    controller.start();
    const coinsBefore = game.getPlayer('p1').coins;
    controller.handleAction('p1', { type: 'buy', shopSlot: 0 });
    const [result, view] = messagesOf('p1').slice(-2);
    expect(result).toEqual({ type: 'action_result', ok: true, fusionCount: 0 });
    expect(view).toMatchObject({ type: 'player_view' });
    expect(game.getPlayer('p1').coins).toBeLessThan(coinsBefore);
    expect(game.getPlayer('p1').units).toHaveLength(1);
  });

  it('recusa a ação inválida com o motivo, sem mexer no estado', () => {
    const { controller, messagesOf, game } = createMatch();
    controller.start();
    controller.handleAction('p1', { type: 'sell', unitId: 'p1-u999' });
    expect(messagesOf('p1').at(-2)).toEqual({ type: 'action_result', ok: false, reason: 'unit_not_found' });
    controller.handleAction('p1', { type: 'move', unitId: 'p1-u999', destination: { kind: 'bench', slot: 0 } });
    expect(game.getPlayer('p1').units).toHaveLength(0);
  });

  it('ignora ações de quem não é jogador humano da partida (os bots só jogam pelo servidor)', () => {
    const { controller, game } = createMatch();
    controller.start();
    const coinsOfBot = game.getPlayer('p2').coins;
    controller.handleAction('p2', { type: 'refresh_shop' });
    expect(game.getPlayer('p2').coins).toBe(coinsOfBot);
  });
});

describe('fases e cronômetros', () => {
  it('quando todos ficam prontos o combate começa na hora, sem esperar os 40 segundos', () => {
    const { controller, scheduler, typesOf } = createMatch();
    controller.start();
    controller.handleAction('p1', { type: 'set_ready', ready: true });
    scheduler.advance(0);
    expect(typesOf('p1')).toContain('combat_started');
  });

  it('sem ninguém pronto, o tempo da preparação acaba e o combate começa sozinho', () => {
    const { controller, scheduler, typesOf } = createMatch();
    controller.start();
    scheduler.advance(39_000);
    expect(typesOf('p1')).not.toContain('combat_started');
    scheduler.advance(1_000);
    expect(typesOf('p1')).toContain('combat_started');
  });

  it('o combate entrega o duelo do jogador e, ao fim, o resultado da rodada com todas as vidas', () => {
    const { controller, scheduler, messagesOf } = createMatch();
    controller.start();
    scheduler.advance(40_000);
    const combat = messagesOf('p1').find((message) => message.type === 'combat_started');
    expect(combat).toMatchObject({ type: 'combat_started', round: 1, duel: { combatConfig: { units: expect.any(Array) }, result: { winner: expect.any(String) } } });
    scheduler.advance(31_000);
    const result = messagesOf('p1').find((message) => message.type === 'round_result');
    expect(result).toMatchObject({ type: 'round_result', round: 1 });
    expect(result?.type === 'round_result' ? result.duels : []).toHaveLength(2);
    expect(result?.type === 'round_result' ? result.players : []).toHaveLength(4);
  });

  it('ações fora da preparação são recusadas', () => {
    const { controller, scheduler, messagesOf } = createMatch();
    controller.start();
    scheduler.advance(40_000);
    controller.handleAction('p1', { type: 'buy', shopSlot: 0 });
    expect(messagesOf('p1').at(-2)).toEqual({ type: 'action_result', ok: false, reason: 'not_in_preparation' });
  });

  it('o cronômetro da rodada seguinte começa depois da tela de resultado', () => {
    const { controller, scheduler, messagesOf } = createMatch();
    controller.start();
    scheduler.advance(40_000 + 30_000 + 5_000);
    const rounds = messagesOf('p1').filter((message) => message.type === 'round_started');
    expect(rounds.map((message) => (message.type === 'round_started' ? message.round : 0))).toEqual([1, 2]);
  });
});

describe('partida inteira e desconexões', () => {
  it('um jogador parado joga até o fim: a partida acaba, avisa a colocação e encerra uma só vez', () => {
    const { controller, scheduler, messagesOf, endedCount, game } = createMatch();
    controller.start();
    scheduler.advance(TEN_MINUTES_MS * 3);
    const ended = messagesOf('p1').find((message) => message.type === 'match_ended');
    expect(ended).toMatchObject({ type: 'match_ended', winnerId: game.winnerId });
    expect(endedCount()).toBe(1);
    expect(controller.isRunning).toBe(false);
  });

  it('quem desconecta passa a ser jogado pelo bot e não trava a rodada', () => {
    const { controller, scheduler, typesOf, game } = createMatch(['p1', 'p2']);
    controller.start();
    controller.handleDisconnect('p2');
    expect(game.getPlayer('p2').ready).toBe(true);
    controller.handleAction('p1', { type: 'set_ready', ready: true });
    scheduler.advance(0);
    expect(typesOf('p1')).toContain('combat_started');
  });

  it('quando todos os humanos saem, a partida é encerrada e os cronômetros param', () => {
    const { controller, scheduler, endedCount } = createMatch(['p1', 'p2']);
    controller.start();
    controller.handleDisconnect('p1');
    expect(endedCount()).toBe(0);
    controller.handleDisconnect('p2');
    expect(endedCount()).toBe(1);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('dispose cancela tudo e nada mais acontece', () => {
    const { controller, scheduler, typesOf } = createMatch();
    controller.start();
    controller.dispose();
    scheduler.advance(TEN_MINUTES_MS);
    expect(typesOf('p1')).not.toContain('combat_started');
  });
});
