import { describe, expect, it } from 'vitest';
import { cellAt, giveUnit, makeContext, makeGame } from '../testSupport';
import { buyFromShop } from '../players/playerActions';
import { TOWER_ID } from './tower';

const hasTower = (units: readonly { readonly characterId: string }[]) => units.some((unit) => unit.characterId === TOWER_ID);

/** p1 compra uma torre como primeira aquisição e a põe no tabuleiro; p2 leva um lutador. */
function gameWithOnlyATowerAgainstOneFighter() {
  const game = makeGame();
  const owner = game.getPlayer('p1');
  owner.shop[0] = { characterId: TOWER_ID, cost: game.config.tower.cost };
  const purchase = buyFromShop(owner, makeContext(), 0);
  expect(purchase.ok).toBe(true);
  game.move('p1', owner.units[0]!.id, { kind: 'board', cell: cellAt(2, 3) });
  giveUnit(game.getPlayer('p2'), 'vinicius', { kind: 'board', cell: cellAt(2, 3) });
  return { game, owner };
}

describe('lado só com a torre', () => {
  it('os inimigos continuam lutando até derrubar a torre, e só então a vida é perdida', () => {
    const { game, owner } = gameWithOnlyATowerAgainstOneFighter();
    const duels = game.resolveCombats();
    const duel = duels.find((candidate) => candidate.topId === 'p1' || candidate.bottomId === 'p1')!;
    expect(duel.result.durationMs).toBeGreaterThan(0);
    expect(duel.result.destroyedStructureIds).toHaveLength(1);

    const summary = game.concludeRound();
    expect(summary.towersLostByPlayerId).toEqual({ p1: 1 });
    expect(hasTower(owner.units)).toBe(false);
    expect(owner.lives).toBe(game.config.rounds.startingLives - 1);
  });

  it('se os dois lados só têm torres, o combate acaba na hora em empate e ninguém perde nada', () => {
    const game = makeGame();
    giveUnit(game.getPlayer('p1'), TOWER_ID, { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(game.getPlayer('p2'), TOWER_ID, { kind: 'board', cell: cellAt(2, 3) });
    const duel = game.resolveCombats()[0]!;
    expect(duel.result).toMatchObject({ winner: 'draw', durationMs: 0, destroyedStructureIds: [] });
  });

  it('uma torre sozinha contra um tabuleiro vazio não custa vida a ninguém', () => {
    const game = makeGame();
    giveUnit(game.getPlayer('p1'), TOWER_ID, { kind: 'board', cell: cellAt(2, 3) });
    game.resolveCombats();
    const summary = game.concludeRound();
    expect(summary.duels[0]!.livesLost).toBe(0);
    expect(hasTower(game.getPlayer('p1').units)).toBe(true);
  });
});

describe('compensação pela torre destruída', () => {
  it('paga uma única vez, no início da rodada seguinte', () => {
    const { game, owner } = gameWithOnlyATowerAgainstOneFighter();
    game.resolveCombats();
    owner.coins = 0;
    game.concludeRound();
    expect(owner.coins).toBe(0);

    game.startNextRound();
    const roundTwoIncome = game.config.economy.incomeByRound[1]!;
    expect(owner.coins).toBe(roundTwoIncome + game.config.tower.compensationOnLoss);

    owner.coins = 0;
    game.resolveCombats();
    game.concludeRound();
    game.startNextRound();
    expect(owner.coins).toBe(game.config.economy.incomeByRound[2]!);
  });
});
