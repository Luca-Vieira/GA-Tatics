import { describe, expect, it } from 'vitest';
import { CombatSimulation } from '@combat/engine/CombatSimulation';
import { DEFAULT_GAME_CONFIG } from '@data/defaults/gameConfig';
import { SeededRandom } from '@shared/utils/random';
import { buildSideUnits } from '../game/combatSetup';
import { buyFromShop, refillShop, refreshShop } from '../players/playerActions';
import { cellAt, giveUnit, makeContext, makeGame, makePlayer } from '../testSupport';
import { buildTowerCharacter, countOwnedTowers, TOWER_ID, towerIncomeOf } from './tower';

const towerConfig = DEFAULT_GAME_CONFIG.tower;

function contextWithTowers(chancePercent: number, maximumOwned = 2) {
  const base = makeContext();
  return { ...base, config: { ...base.config, tower: { ...towerConfig, offerChancePercent: chancePercent, maximumOwned } }, towerRandom: new SeededRandom('torres') };
}

describe('torre na loja', () => {
  it('com 100% de chance toda vaga vira torre, até o máximo por jogador', () => {
    const player = makePlayer();
    refillShop(player, contextWithTowers(100, 2));
    expect(player.shop.map((offer) => offer?.characterId)).toEqual([TOWER_ID, TOWER_ID, expect.not.stringMatching(TOWER_ID)]);
    expect(player.shop[0]?.cost).toBe(towerConfig.cost);
  });

  it('com 0% de chance, ou sem sorteio de torres, nunca aparece torre', () => {
    const player = makePlayer();
    refillShop(player, contextWithTowers(0));
    refillShop(player, makeContext());
    expect(player.shop.some((offer) => offer?.characterId === TOWER_ID)).toBe(false);
  });

  it('as torres que o jogador já tem contam para o máximo', () => {
    const player = makePlayer();
    giveUnit(player, TOWER_ID, { kind: 'board', cell: cellAt(1, 2) });
    giveUnit(player, TOWER_ID, { kind: 'bench', slot: 0 });
    refillShop(player, contextWithTowers(100, 2));
    expect(player.shop.some((offer) => offer?.characterId === TOWER_ID)).toBe(false);
  });

  it('uma torre congelada continua na loja quando ela é atualizada', () => {
    const player = makePlayer();
    player.coins = 50;
    refillShop(player, contextWithTowers(100, 1));
    const towerSlot = player.shop.findIndex((offer) => offer?.characterId === TOWER_ID);
    player.shop[towerSlot] = { ...player.shop[towerSlot]!, frozen: true };
    refreshShop(player, contextWithTowers(0, 1));
    expect(player.shop[towerSlot]).toMatchObject({ characterId: TOWER_ID, frozen: true });
  });

  it('comprar põe a torre na reserva, não funde e respeita o máximo', () => {
    const player = makePlayer();
    player.coins = 100;
    const context = makeContext();
    player.shop = Array.from({ length: 3 }, () => ({ characterId: TOWER_ID, cost: towerConfig.cost }));
    expect(buyFromShop(player, context, 0)).toMatchObject({ ok: true, fusions: [] });
    expect(buyFromShop(player, context, 1)).toMatchObject({ ok: true, fusions: [] });
    expect(buyFromShop(player, context, 2)).toEqual({ ok: false, reason: 'tower_limit' });
    expect(countOwnedTowers(player)).toBe(2);
    expect(player.units.every((unit) => unit.starLevel === 1)).toBe(true);
    expect(player.coins).toBe(100 - 2 * towerConfig.cost);
  });

  it('a torre tem definição própria para a interface, com vida e texto da configuração', () => {
    const character = buildTowerCharacter(towerConfig);
    expect(character).toMatchObject({ id: TOWER_ID, name: 'Torre', stats: { health: towerConfig.health } });
    expect(character.ability.description).toContain(`+${towerConfig.incomePerRound} moedas`);
  });
});

describe('torre na economia', () => {
  it('só as torres do tabuleiro rendem moedas', () => {
    const player = makePlayer();
    giveUnit(player, TOWER_ID, { kind: 'board', cell: cellAt(1, 2) });
    giveUnit(player, TOWER_ID, { kind: 'bench', slot: 0 });
    giveUnit(player, 'bixo', { kind: 'board', cell: cellAt(2, 2) });
    expect(towerIncomeOf(player, towerConfig)).toBe(towerConfig.incomePerRound);
  });

  it('a renda entra no início da rodada seguinte, além da renda normal', () => {
    const economyGame = makeGame();
    const owner = economyGame.getPlayer('p1');
    giveUnit(owner, TOWER_ID, { kind: 'board', cell: cellAt(1, 3) });
    giveUnit(owner, 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    owner.coins = 0;
    // O adversário (p2) não tem unidades, então a torre sobrevive à rodada.
    economyGame.resolveCombats();
    economyGame.concludeRound();
    expect(owner.units.some((unit) => unit.characterId === TOWER_ID)).toBe(true);
    economyGame.startNextRound();
    expect(owner.coins).toBe(5 + towerConfig.incomePerRound);
  });
});

const game = makeGame();

describe('torre no combate', () => {
  it('entra como estrutura: não se move, não ataca, e o combate acaba quando só ela resta de um lado', () => {
    const game = makeGame();
    const player = game.getPlayer('p1');
    giveUnit(player, TOWER_ID, { kind: 'board', cell: cellAt(2, 3) });
    const specs = buildSideUnits(player, 'A', { charactersById: new Map([[TOWER_ID, game.getCharacter(TOWER_ID)]]), synergies: game.synergies, synergyMapping: game.synergyMapping });
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ isStructure: true, name: 'Torre' });

    const bixo = giveUnit(game.getPlayer('p2'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    const enemySpecs = buildSideUnits(game.getPlayer('p2'), 'B', { charactersById: new Map([['bixo', game.getCharacter('bixo')]]), synergies: game.synergies, synergyMapping: game.synergyMapping });
    expect(bixo.characterId).toBe('bixo');
    const simulation = new CombatSimulation({ seed: 'torre', units: [...specs, ...enemySpecs] });
    const result = simulation.run();
    // Só há torre de um lado: o outro lado vence na hora, e a torre não conta como unidade viva.
    expect(result.winner).toBe('B');
    expect(result.aliveCountBySide.A).toBe(0);
    expect(result.destroyedStructureIds).toEqual([]);
  });

  it('uma torre que apanha até morrer aparece em destroyedStructureIds e não entre os sobreviventes', () => {
    const stats = { health: 1, damage: 1, attackSpeed: 1, range: 1, mobility: 1 };
    const bixo = game.getCharacter('bixo');
    const joao = game.getCharacter('joao_lucas');
    const units = [
      { id: 'A-torre', name: 'Torre', side: 'A' as const, cell: cellAt(2, 3), stats, isStructure: true },
      { id: 'A-bixo', name: 'Bixo', side: 'A' as const, cell: cellAt(4, 0), stats: bixo.stats, behavior: bixo.behavior },
      { id: 'B-joao', name: 'João', side: 'B' as const, cell: cellAt(2, 4), stats: joao.stats, behavior: joao.behavior },
    ];
    const result = new CombatSimulation({ seed: 'torre-morre', units }).run();
    expect(result.destroyedStructureIds).toEqual(['A-torre']);
    expect(result.survivors.map((survivor) => survivor.unitId)).not.toContain('A-torre');
    // A vida restante do lado A só considera o bixo.
    expect(result.healthPercentBySide.A).toBeLessThanOrEqual(100);
  });
});

describe('torre destruída', () => {
  it('some para sempre do jogador, mesmo que ele tenha vencido, e a rodada informa a perda', () => {
    const game = makeGame({ bottomPlayerId: 'p2' });
    const owner = game.getPlayer('p1');
    giveUnit(owner, TOWER_ID, { kind: 'board', cell: cellAt(0, 0) });
    giveUnit(owner, 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(game.getPlayer('p2'), 'helder', { kind: 'board', cell: cellAt(2, 3) });
    game.resolveCombats();

    // Força o desfecho: a torre foi destruída neste combate.
    const duel = (game as unknown as { pendingDuels: { topId: string; bottomId: string; result: { destroyedStructureIds: string[] } }[] }).pendingDuels.find((candidate) => candidate.topId === 'p1' || candidate.bottomId === 'p1')!;
    const side = duel.topId === 'p1' ? 'A' : 'B';
    const towerUnit = owner.units.find((unit) => unit.characterId === TOWER_ID)!;
    duel.result.destroyedStructureIds.push(`${side}-${towerUnit.id}`);

    const summary = game.concludeRound();
    expect(summary.towersLostByPlayerId).toEqual({ p1: 1 });
    expect(owner.units.some((unit) => unit.characterId === TOWER_ID)).toBe(false);
    expect(owner.units.some((unit) => unit.characterId === 'bixo')).toBe(true);
  });

  it('sem torres destruídas, a rodada não informa perdas', () => {
    const game = makeGame();
    game.resolveCombats();
    expect(game.concludeRound().towersLostByPlayerId).toEqual({});
  });
});
