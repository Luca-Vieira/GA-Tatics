import { describe, expect, it } from 'vitest';
import { createPairings, type RoundRecord } from './pairings';
import { livesLostOnDefeat, preparationSecondsForRound, unitLimitForRound } from './rounds';
import { DEFAULT_GAME_CONFIG } from '@data/defaults/gameConfig';

const FOUR = ['A', 'B', 'C', 'D'];

/** Simula `roundCount` rodadas seguidas e devolve os confrontos de cada uma. */
function playRounds(ids: readonly string[], roundCount: number): RoundRecord[] {
  const history: RoundRecord[] = [];
  for (let round = 1; round <= roundCount; round++) {
    const { pairs, resting } = createPairings(ids, history);
    history.push({ round, pairs, resting });
  }
  return history;
}

describe('pareamento', () => {
  it('com 4 jogadores segue AB/CD, AC/BD, AD/BC e depois repete', () => {
    const rounds = playRounds(FOUR, 4);
    expect(rounds[0]!.pairs).toEqual([['A', 'B'], ['C', 'D']]);
    expect(rounds[1]!.pairs).toEqual([['A', 'C'], ['B', 'D']]);
    expect(rounds[2]!.pairs).toEqual([['A', 'D'], ['B', 'C']]);
    expect(rounds[3]!.pairs).toEqual([['A', 'B'], ['C', 'D']]);
  });

  it('com 3 jogadores um descansa por rodada e os descansos se distribuem', () => {
    const rounds = playRounds(['A', 'B', 'C'], 6);
    expect(rounds.every((round) => round.pairs.length === 1 && round.resting !== null)).toBe(true);
    const restCounts = ['A', 'B', 'C'].map((id) => rounds.filter((round) => round.resting === id).length);
    expect(restCounts).toEqual([2, 2, 2]);
  });

  it('com 2 jogadores todos lutam, sem descanso', () => {
    const { pairs, resting } = createPairings(['A', 'B'], []);
    expect(pairs).toEqual([['A', 'B']]);
    expect(resting).toBeNull();
  });

  it('com um jogador só não há duelo', () => {
    expect(createPairings(['A'], [])).toEqual({ pairs: [], resting: 'A' });
  });

  it('não depende da ordem em que os jogadores são listados', () => {
    expect(createPairings(['D', 'B', 'A', 'C'], [])).toEqual(createPairings(FOUR, []));
  });
});

describe('regras de rodada', () => {
  const rounds = DEFAULT_GAME_CONFIG.rounds;

  it('limite de unidades: 3, 4, 5, 6 e depois 7', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((round) => unitLimitForRound(rounds, round))).toEqual([3, 4, 5, 6, 7, 7, 7]);
  });

  it('a preparação cai de 40 s para 30 s a partir da rodada 6', () => {
    expect([1, 5, 6, 9].map((round) => preparationSecondsForRound(rounds, round))).toEqual([40, 40, 30, 30]);
  });

  it('a partir da rodada 10 a derrota custa 2 vidas', () => {
    expect([1, 9, 10, 11].map((round) => livesLostOnDefeat(rounds, round))).toEqual([1, 1, 2, 2]);
  });
});
