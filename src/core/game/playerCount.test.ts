import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { INITIAL_SYNERGY_MAPPING } from '@data/defaults/synergies';
import { makeGame } from '../testSupport';
import { playMatchWithBots } from './botMatch';
import { MAXIMUM_PLAYERS, MINIMUM_PLAYERS } from './Game';
import { runGameBatch } from './gameBatch';
import { LocalMatchSession } from './LocalMatchSession';

const botPlayers = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `p${index + 1}`, isBot: true }));

describe('quantidade de jogadores', () => {
  it('aceita de 2 a 8 e recusa fora disso', () => {
    expect([MINIMUM_PLAYERS, MAXIMUM_PLAYERS]).toEqual([2, 8]);
    expect(() => makeGame({ players: botPlayers(1) })).toThrow();
    expect(() => makeGame({ players: botPlayers(9) })).toThrow();
  });

  it.each([2, 3, 5, 8])('com %i jogadores, cada rodada junta todos em duelos (um descansa se for ímpar) e há um vencedor', (count) => {
    const game = makeGame({ seed: `mesa-${count}`, players: botPlayers(count) });
    const { pairs, resting } = game.pairings;
    expect(pairs).toHaveLength(Math.floor(count / 2));
    expect(resting === null).toBe(count % 2 === 0);
    const seated = [...pairs.flat(), ...(resting ? [resting] : [])].sort();
    expect(seated).toEqual(game.players.map((player) => player.id).sort());

    const report = playMatchWithBots(game);
    expect(game.isFinished).toBe(true);
    expect(report.winnerId).not.toBeNull();
    const places = game.standings().map((standing) => standing.place);
    expect(places.filter((place) => place === 1)).toHaveLength(1);
    expect(Math.max(...places)).toBeLessThanOrEqual(count);
  });

  it('nenhuma mesa trava', () => {
    for (const playerCount of [2, 8]) {
      const report = runGameBatch({ games: 10, seedBase: 3, roster: DEFAULT_CHARACTERS, synergyMapping: INITIAL_SYNERGY_MAPPING, playerCount });
      expect(report.stalledGames, `${playerCount} jogadores`).toBe(0);
    }
  }, 120_000);

  it('a partida local aceita escolher quantos jogadores, e por padrão são 4', () => {
    expect(new LocalMatchSession({ seed: 'padrao' }).match.players).toHaveLength(4);
    const session = new LocalMatchSession({ seed: 'oito', playerCount: 8 });
    expect(session.match.players).toHaveLength(8);
    expect(new Set(session.match.players.map((player) => player.name)).size).toBe(8);
    expect(() => new LocalMatchSession({ playerCount: 9 })).toThrow();
  });
});

describe('abandono', () => {
  it('a sessão local não tem modo espectador, e sair encerra a partida', () => {
    const session = new LocalMatchSession({ seed: 'sair' });
    session.start();
    expect(session.spectator).toBeNull();
    session.leave();
    session.update(10 * 60_000);
    expect(session.match.phase).toBe('preparation');
    expect(session.preparationRemainingMs).toBe(0);
  });

  it('quem sai pode virar bot sem perder o que tem', () => {
    const game = makeGame({ players: [{ id: 'p1', name: 'Pessoa', isBot: false }, ...botPlayers(3).map((bot) => ({ ...bot, id: `b${bot.id}` }))] });
    const before = structuredClone(game.getPlayer('p1'));
    game.convertToBot('p1');
    expect(game.getPlayer('p1')).toEqual({ ...before, isBot: true });
  });
});
