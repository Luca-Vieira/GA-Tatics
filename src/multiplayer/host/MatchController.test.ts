import { describe, expect, it } from 'vitest';
import { cellAt, giveUnit, makeGame } from '@core/testSupport';
import { coinsAtRoundStart } from '@core/economy/economy';
import type { ServerMessage } from '../protocol/serverMessages';
import { MatchController, MINIMUM_COMBAT_PHASE_MS } from './MatchController';
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

  it('o resultado sai quando o duelo que alguém vê termina, sem esperar um combate só entre bots', () => {
    const { controller, scheduler, messagesOf, typesOf } = createMatch();
    controller.start();
    scheduler.advance(40_000);
    const combat = messagesOf('p1').find((message) => message.type === 'combat_started');
    const ownDurationMs = combat?.type === 'combat_started' ? combat.duel!.result.durationMs : 0;
    const expectedWaitMs = Math.max(ownDurationMs, MINIMUM_COMBAT_PHASE_MS);
    scheduler.advance(expectedWaitMs - 1);
    expect(typesOf('p1')).not.toContain('round_result');
    scheduler.advance(1);
    expect(typesOf('p1')).toContain('round_result');
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

  it('a torre destruída e a compensação chegam ao jogador: some das unidades e as moedas são as do servidor', () => {
    const { controller, scheduler, messagesOf, typesOf, game } = createMatch();
    controller.start();
    giveUnit(game.getPlayer('p1'), 'torre', { kind: 'board', cell: cellAt(2, 5) });
    controller.handleAction('p1', { type: 'set_ready', ready: true });
    scheduler.advance(0);
    while (!typesOf('p1').includes('round_result')) {
      scheduler.advance(100);
    }
    const result = messagesOf('p1').find((message) => message.type === 'round_result');
    expect(result).toMatchObject({ towersLostByPlayerId: { p1: 1 } });
    const coinsBeforeNextRound = game.getPlayer('p1').coins;
    scheduler.advance(5_000);
    const view = messagesOf('p1').filter((message) => message.type === 'player_view').at(-1);
    expect(view).toMatchObject({ view: { coins: game.getPlayer('p1').coins, units: [] } });
    // Sem a torre não há renda dela: sobra a renda normal da rodada mais a compensação.
    expect(game.getPlayer('p1').coins).toBe(coinsAtRoundStart(game.config.economy, coinsBeforeNextRound, 2) + game.config.tower.compensationOnLoss);
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

describe('ver a luta de outro jogador', () => {
  const messagesOfType = <Type extends ServerMessage['type']>(messages: readonly ServerMessage[], type: Type) =>
    messages.filter((message): message is Extract<ServerMessage, { type: Type }> => message.type === type);

  /** Leva a partida até o combate e devolve a luta de p1 e um jogador que está na outra. */
  function matchInCombat() {
    const match = createMatch(['p1']);
    match.controller.start();
    match.scheduler.advance(40_000);
    const ownDuel = messagesOfType(match.messagesOf('p1'), 'combat_started').at(-1)!.duel!;
    const otherId = match.game.players.find((player) => ![ownDuel.topId, ownDuel.bottomId].includes(player.id))!.id;
    return { ...match, otherId };
  }

  it('quem está vivo recebe a luta pedida enquanto ela acontece, sem deixar de ser jogador', () => {
    const { controller, messagesOf, otherId } = matchInCombat();
    expect(controller.watchAsPlayer('p1', otherId)).toBe(true);
    const peek = messagesOfType(messagesOf('p1'), 'combat_peek').at(-1)!;
    expect(peek.playerId).toBe(otherId);
    expect([peek.duel.topId, peek.duel.bottomId]).toContain(otherId);
    expect(messagesOfType(messagesOf('p1'), 'watching')).toHaveLength(0);
  });

  it('a rodada espera a luta que alguém foi ver', () => {
    const { controller, scheduler, messagesOf, otherId } = matchInCombat();
    controller.watchAsPlayer('p1', otherId);
    const durations = [messagesOfType(messagesOf('p1'), 'combat_started'), messagesOfType(messagesOf('p1'), 'combat_peek')].map((list) => list.at(-1)!.duel!.result.durationMs);
    const longestMs = Math.max(MINIMUM_COMBAT_PHASE_MS, ...durations);
    scheduler.advance(longestMs - 1);
    expect(messagesOfType(messagesOf('p1'), 'round_result')).toHaveLength(0);
    scheduler.advance(1);
    expect(messagesOfType(messagesOf('p1'), 'round_result')).toHaveLength(1);
  });

  it('fora do combate, ou com a luta já encerrada, o pedido é recusado', () => {
    const { controller, messagesOf } = createMatch(['p1']);
    controller.start();
    controller.watchAsPlayer('p1', 'p2');
    expect(messagesOf('p1').at(-1)).toEqual({ type: 'action_result', ok: false, reason: 'player_not_in_combat' });
  });

  it('jogador inexistente não é aceito', () => {
    const { controller } = createMatch(['p1']);
    controller.start();
    expect(controller.watchAsPlayer('p1', 'p99')).toBe(false);
  });

  it('quem assiste e troca de jogador na tela de resultado não é jogado para uma preparação vazia', () => {
    const { controller, scheduler, messagesOf } = matchWithEliminatedPlayer();
    scheduler.advance(40_000);
    for (let step = 0; step < 200 && messagesOfType(messagesOf('p1'), 'round_result').length < 2; step++) {
      scheduler.advance(500);
    }
    const before = messagesOf('p1').length;
    controller.watchAsPlayer('p1', 'p3');
    expect(messagesOf('p1').slice(before)).toEqual([{ type: 'watching', playerId: 'p3' }]);
  });

  /** p1 fica com uma vida e sem ninguém em campo: perde a primeira rodada e está fora. */
  function matchWithEliminatedPlayer() {
    const match = createMatch(['p1', 'p2']);
    match.controller.start();
    const loser = match.game.getPlayer('p1');
    loser.lives = 1;
    loser.units = [];
    loser.coins = 0;
    // O adversário precisa de ao menos um lutador, senão a rodada empata.
    giveUnit(match.game.getPlayer('p2'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    for (let step = 0; step < 200 && match.game.round === 1; step++) {
      match.scheduler.advance(1000);
    }
    return match;
  }

  it('quem foi eliminado passa a acompanhar alguém vivo já na preparação seguinte, vendo o tabuleiro sem a reserva', () => {
    const { game, messagesOf } = matchWithEliminatedPlayer();
    expect(game.getPlayer('p1').eliminatedInRound).toBe(1);
    const watching = messagesOfType(messagesOf('p1'), 'watching').at(-1)!;
    expect(game.getPlayer(watching.playerId).eliminatedInRound).toBeNull();
    const board = messagesOfType(messagesOf('p1'), 'scout_board').at(-1)!;
    expect(board.playerId).toBe(watching.playerId);
    expect(board.units.every((unit) => unit.location.kind === 'board')).toBe(true);
    const lastRound = messagesOf('p1').map((message) => message.type).lastIndexOf('round_started');
    expect(messagesOf('p1').slice(lastRound).map((message) => message.type)).not.toContain('player_view');
  });

  it('o eliminado troca de quem acompanha a qualquer momento, vê as mudanças na hora e depois a luta', () => {
    const { controller, game, scheduler, messagesOf } = matchWithEliminatedPlayer();
    controller.watchAsPlayer('p1', 'p2');
    const boardsOfP2 = () => messagesOfType(messagesOf('p1'), 'scout_board').filter((message) => message.playerId === 'p2');
    const before = boardsOfP2().length;
    const unit = game.getPlayer('p2').units.find((candidate) => candidate.location.kind === 'board')!;
    controller.handleAction('p2', { type: 'move', unitId: unit.id, destination: { kind: 'board', cell: cellAt(0, 4) } });
    expect(boardsOfP2()).toHaveLength(before + 1);
    expect(boardsOfP2().at(-1)!.units).toContainEqual(expect.objectContaining({ id: unit.id, location: { kind: 'board', cell: cellAt(0, 4) } }));
    expect(JSON.stringify(boardsOfP2())).not.toContain('shop');

    scheduler.advance(40_000);
    const duel = messagesOfType(messagesOf('p1'), 'combat_started').at(-1)!.duel!;
    expect([duel.topId, duel.bottomId]).toContain('p2');
  });
});

