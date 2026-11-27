import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { playBotPreparation } from '../players/botStrategy';
import { playMatchWithBots } from './botMatch';
import { boardUnitsOf } from '../players/playerState';
import { cellAt, giveUnit, makeGame } from '../testSupport';
import type { Game } from './Game';

/** Joga uma rodada: bots se preparam (ou quem estiver pronto), combates são simulados e resultados aplicados. */
function playRound(game: Game) {
  game.players.filter((player) => player.isBot && player.eliminatedInRound === null).forEach((player) => playBotPreparation(game, player.id));
  game.resolveCombats();
  return game.concludeRound();
}

function playUntilFinished(game: Game, maximumRounds = 80): number {
  let rounds = 0;
  while (!game.isFinished && rounds < maximumRounds) {
    playRound(game);
    rounds++;
    if (!game.isFinished) {
      game.startNextRound();
    }
  }
  return rounds;
}

describe('primeiro descanso', () => {
  const players = ['p1', 'p2', 'p3'].map((id) => ({ id, name: id, isBot: true }));
  const firstRestingOf = (seed: string) => makeGame({ seed, players }).pairings.resting!;

  it('é sorteado por partida: nenhum lugar descansa primeiro mais vezes que os outros', () => {
    const SEEDS = 600;
    const restingCounts = new Map(players.map((player) => [player.id, 0]));
    for (let index = 0; index < SEEDS; index++) {
      const resting = firstRestingOf(`sorteio-${index}`);
      restingCounts.set(resting, restingCounts.get(resting)! + 1);
    }
    for (const [playerId, count] of restingCounts) {
      expect(count / SEEDS, playerId).toBeGreaterThan(0.28);
      expect(count / SEEDS, playerId).toBeLessThan(0.39);
    }
  });

  it('a mesma semente sempre dá o mesmo descanso', () => {
    expect(firstRestingOf('mesma-semente')).toBe(firstRestingOf('mesma-semente'));
  });
});

describe('lado de cada duelo', () => {
  const players = ['p1', 'p2'].map((id) => ({ id, name: id, isBot: true }));
  const topOfFirstDuel = (seed: string) => makeGame({ seed, players }).resolveCombats()[0]!.topId;

  it('é sorteado: o primeiro lugar não luta sempre do mesmo lado', () => {
    const SEEDS = 200;
    let firstSeatOnTop = 0;
    for (let index = 0; index < SEEDS; index++) {
      firstSeatOnTop += topOfFirstDuel(`lado-${index}`) === 'p1' ? 1 : 0;
    }
    expect(firstSeatOnTop / SEEDS).toBeGreaterThan(0.4);
    expect(firstSeatOnTop / SEEDS).toBeLessThan(0.6);
  });

  it('a mesma semente sempre dá o mesmo lado', () => {
    expect(topOfFirstDuel('mesma-semente')).toBe(topOfFirstDuel('mesma-semente'));
  });
});

describe('início da partida', () => {
  it('todos começam na rodada 1 com 3 vidas, 5 moedas, tabuleiro e reserva vazios e uma loja de 5 ofertas', () => {
    const game = makeGame();
    expect(game.round).toBe(1);
    expect(game.phase).toBe('preparation');
    for (const player of game.players) {
      expect(player.lives).toBe(3);
      expect(player.coins).toBe(5);
      expect(player.units).toHaveLength(0);
      expect(player.shop).toHaveLength(5);
    }
  });

  it('a rodada 1 define A×B e C×D', () => {
    const game = makeGame();
    expect(game.pairings.pairs).toEqual([['p1', 'p2'], ['p3', 'p4']]);
    expect(game.opponentOf('p3')).toBe('p4');
  });

  it('exige ao menos dois jogadores', () => {
    expect(() => makeGame({ players: [{ id: 'p1', name: 'Só', isBot: true }] })).toThrow();
  });

  it('a mesma semente gera as mesmas lojas', () => {
    const first = makeGame();
    const second = makeGame();
    expect(first.getPlayer('p1').shop).toEqual(second.getPlayer('p1').shop);
    expect(makeGame({ seed: 'outra' }).getPlayer('p1').shop).not.toEqual(first.getPlayer('p1').shop);
  });
});

describe('ações na preparação', () => {
  it('ações só valem durante a preparação', () => {
    const game = makeGame();
    game.resolveCombats();
    expect(game.buy('p1', 0)).toEqual({ ok: false, reason: 'not_in_preparation' });
  });

  it('o jogador de baixo na tela é o escolhido (lado B), e as casas dele são espelhadas', () => {
    const game = makeGame({ bottomPlayerId: 'p1' });
    giveUnit(game.getPlayer('p1'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(game.getPlayer('p2'), 'leo', { kind: 'board', cell: cellAt(2, 3) });
    const [duel] = game.resolveCombats();
    expect(duel!.topId).toBe('p2');
    expect(duel!.bottomId).toBe('p1');
    const bixo = duel!.combatConfig.units.find((unit) => unit.characterId === 'bixo')!;
    expect(bixo.side).toBe('B');
    expect(bixo.cell).toEqual(cellAt(2, 8));
  });

  it('os bônus de sinergia do tabuleiro entram nas unidades do combate (a reserva não conta)', () => {
    const game = makeGame();
    const player = game.getPlayer('p1');
    giveUnit(player, 'vinicius', { kind: 'board', cell: cellAt(1, 3) });
    giveUnit(player, 'leo', { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(player, 'matheus', { kind: 'bench', slot: 0 });
    giveUnit(player, 'moco', { kind: 'bench', slot: 1 });
    const [duel] = game.resolveCombats();
    const playerUnits = duel!.combatConfig.units.filter((unit) => unit.id.includes('p1-'));
    expect(playerUnits).toHaveLength(2);
    // 2 de Caos no tabuleiro → +5% dano, +3% velocidade de ataque.
    expect(playerUnits.every((unit) => unit.bonuses?.damageMultiplier === 1.05)).toBe(true);
    expect(game.synergyStatusesOf('p1').find((status) => status.synergy.id === 'caos')?.count).toBe(2);
  });
});

describe('rodadas, vidas e eliminação', () => {
  it('perder o combate custa 1 vida, empate e descanso não custam, e a vitória não dá nada', () => {
    const game = makeGame();
    giveUnit(game.getPlayer('p1'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(game.getPlayer('p3'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(game.getPlayer('p4'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    game.resolveCombats();
    const summary = game.concludeRound();
    const [firstDuel] = summary.duels;
    expect(firstDuel!.loserId).toBe('p2');
    expect(game.getPlayer('p2').lives).toBe(2);
    expect(game.getPlayer('p1').lives).toBe(3);
    // p3 e p4 têm exatamente o mesmo time: o resultado é decidido pelo desempate, mas nunca tira mais de uma vida.
    const lostLives = ['p3', 'p4'].map((id) => 3 - game.getPlayer(id).lives);
    expect(lostLives.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
  });

  it('dois jogadores sem unidades empatam e ninguém perde vida', () => {
    const game = makeGame();
    game.resolveCombats();
    const summary = game.concludeRound();
    expect(summary.duels.every((duel) => duel.winnerId === null && duel.livesLost === 0)).toBe(true);
    expect(game.players.every((player) => player.lives === 3)).toBe(true);
  });

  it('a próxima rodada soma renda e juros, renova a loja e zera o "pronto"', () => {
    const game = makeGame();
    game.getPlayer('p1').coins = 5;
    game.setReady('p1', true);
    game.resolveCombats();
    game.concludeRound();
    game.startNextRound();
    expect(game.round).toBe(2);
    // 5 guardadas + 1 de juros + 5 da tabela da rodada 2.
    expect(game.getPlayer('p1').coins).toBe(10);
    expect(game.getPlayer('p1').ready).toBe(false);
    expect(game.getPlayer('p1').shop).toHaveLength(5);
    expect(game.pairings.pairs).toEqual([['p1', 'p3'], ['p2', 'p4']]);
  });

  it('a partir da rodada 10 a derrota custa 2 vidas', () => {
    const game = makeGame({ players: [{ id: 'p1', name: 'A', isBot: true }, { id: 'p2', name: 'B', isBot: true }] });
    for (let round = 1; round < 10; round++) {
      game.resolveCombats();
      game.concludeRound();
      game.startNextRound();
    }
    expect(game.round).toBe(10);
    giveUnit(game.getPlayer('p1'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    game.resolveCombats();
    const summary = game.concludeRound();
    expect(summary.duels[0]!.livesLost).toBe(2);
    expect(game.getPlayer('p2').lives).toBe(1);
  });

  it('quem chega a zero vidas é eliminado, e a partida acaba com um sobrevivente', () => {
    const game = makeGame({ players: [{ id: 'p1', name: 'A', isBot: true }, { id: 'p2', name: 'B', isBot: true }] });
    giveUnit(game.getPlayer('p1'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    for (let round = 1; round <= 3; round++) {
      game.resolveCombats();
      const summary = game.concludeRound();
      if (round < 3) {
        expect(summary.eliminatedIds).toEqual([]);
        game.startNextRound();
      } else {
        expect(summary.eliminatedIds).toEqual(['p2']);
      }
    }
    expect(game.isFinished).toBe(true);
    expect(game.winnerId).toBe('p1');
    expect(game.standings()).toEqual([{ playerId: 'p1', place: 1 }, { playerId: 'p2', place: 2 }]);
  });
});

describe('partidas completas com bots', () => {
  it('uma partida parada na tela de resultado pode ser terminada pelos bots', () => {
    const game = makeGame({ seed: 'retomada' });
    playRound(game);
    expect(game.phase).toBe('result');
    const report = playMatchWithBots(game);
    expect(game.isFinished).toBe(true);
    expect(report.winnerId).toBe(game.winnerId);
  });

  it('chegam ao fim com um único vencedor', () => {
    const game = makeGame();
    const rounds = playUntilFinished(game);
    expect(game.isFinished).toBe(true);
    expect(rounds).toBeLessThan(80);
    expect(game.alivePlayers).toHaveLength(1);
    expect(game.winnerId).toBe(game.alivePlayers[0]!.id);
    const places = game.standings().map((standing) => standing.place);
    expect(places.filter((place) => place === 1)).toHaveLength(1);
  });

  it('são reproduzíveis: mesma semente, mesma partida', () => {
    const first = makeGame({ seed: 'repetida' });
    const second = makeGame({ seed: 'repetida' });
    const firstRounds = playUntilFinished(first);
    const secondRounds = playUntilFinished(second);
    expect(secondRounds).toBe(firstRounds);
    expect(second.winnerId).toBe(first.winnerId);
    expect(second.standings()).toEqual(first.standings());
  });

  it('os bots respeitam limites de tabuleiro e reserva e só usam metade própria', () => {
    const game = makeGame({ seed: 'limites' });
    for (let round = 1; round <= 6 && !game.isFinished; round++) {
      game.players.filter((player) => player.eliminatedInRound === null).forEach((player) => playBotPreparation(game, player.id));
      for (const player of game.alivePlayers) {
        expect(boardUnitsOf(player).length).toBeLessThanOrEqual(game.unitLimit);
        expect(player.units.filter((unit) => unit.location.kind === 'bench').length).toBeLessThanOrEqual(game.config.rounds.benchSize);
        const cells = boardUnitsOf(player).map((unit) => (unit.location.kind === 'board' ? `${unit.location.cell.q},${unit.location.cell.r}` : ''));
        expect(new Set(cells).size).toBe(cells.length);
      }
      game.resolveCombats();
      game.concludeRound();
      if (!game.isFinished) game.startNextRound();
    }
  });

  it('usam todo o elenco ao longo de várias partidas', () => {
    const seen = new Set<string>();
    for (let match = 0; match < 4; match++) {
      const game = makeGame({ seed: `elenco-${match}` });
      playUntilFinished(game);
      game.players.forEach((player) => player.units.forEach((unit) => seen.add(unit.characterId)));
    }
    expect(seen.size).toBeGreaterThanOrEqual(DEFAULT_CHARACTERS.length - 3);
  });
});

describe('oferta congelada entre rodadas', () => {
  it('a oferta congelada continua na loja da rodada seguinte, as demais são sorteadas de novo', () => {
    const game = makeGame();
    const before = game.getPlayer('p1').shop[0]!;
    expect(game.toggleFreeze('p1', 0)).toMatchObject({ ok: true });
    game.resolveCombats();
    game.concludeRound();
    game.startNextRound();
    expect(game.getPlayer('p1').shop[0]).toEqual({ ...before, frozen: true });
    expect(game.getPlayer('p2').shop[0]?.frozen).toBeUndefined();
  });

  it('só dá para congelar na preparação', () => {
    const game = makeGame();
    game.resolveCombats();
    expect(game.toggleFreeze('p1', 0)).toEqual({ ok: false, reason: 'not_in_preparation' });
  });
});

