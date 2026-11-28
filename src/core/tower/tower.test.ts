import { describe, expect, it } from 'vitest';
import { CombatSimulation } from '@combat/engine/CombatSimulation';
import { createCombatUnit } from '@combat/units/createCombatUnit';
import { DEFAULT_CHARACTERS } from '@data/defaults/characters';
import { DEFAULT_GAME_CONFIG } from '@data/defaults/gameConfig';
import { DEFAULT_SYNERGIES, INITIAL_SYNERGY_MAPPING } from '@data/defaults/synergies';
import { gameConfigSchema } from '@data/schemas/gameConfig';
import { SeededRandom } from '@shared/utils/random';
import { buildSideUnits } from '../game/combatSetup';
import { playBotPreparation } from '../players/botStrategy';
import { buyFromShop, moveUnit, refillShop, refreshShop } from '../players/playerActions';
import { cellAt, giveUnit, makeContext, makeGame, makePlayer } from '../testSupport';
import {
  boardFightersOf,
  buildTowerCharacter,
  buildTowerCharacters,
  countOwnedTowers,
  isTowerId,
  offeredTowersOf,
  TOWER_ID,
  towerDefinitionOf,
  towerDefinitionsOf,
  towerIncomeOf,
} from './tower';

const towerConfig = DEFAULT_GAME_CONFIG.tower;

function contextWithTowers(chancePercent: number, maximumOwned = 2) {
  const base = makeContext();
  return { ...base, config: { ...base.config, tower: { ...towerConfig, offerChancePercent: chancePercent, maximumOwned } }, towerRandom: new SeededRandom('torres') };
}

describe('torre na loja', () => {
  it('com 100% de chance toda vaga vira torre, até o máximo por jogador', () => {
    const player = makePlayer();
    refillShop(player, contextWithTowers(100, 2));
    const offeredIds = player.shop.map((offer) => offer?.characterId);
    expect(offeredIds).toHaveLength(DEFAULT_GAME_CONFIG.shop.offerSize);
    expect(offeredIds.slice(0, 2)).toEqual([TOWER_ID, TOWER_ID]);
    expect(offeredIds.slice(2)).not.toContain(TOWER_ID);
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
    const character = buildTowerCharacter(towerDefinitionOf(towerConfig, TOWER_ID));
    expect(character).toMatchObject({ id: TOWER_ID, name: 'Torre', stats: { health: towerConfig.health } });
    expect(character.ability.description).toContain(`+${towerConfig.incomePerRound} moedas`);
  });
});

describe('torre e o limite de unidades', () => {
  // Rodada 1: o limite é de 3 lutadores.
  function playerWithFullTeam() {
    const player = makePlayer();
    [0, 1, 2].forEach((column) => giveUnit(player, 'bixo', { kind: 'board', cell: cellAt(column, 5) }));
    return player;
  }

  it('a torre entra no tabuleiro mesmo com o time completo', () => {
    const player = playerWithFullTeam();
    const tower = giveUnit(player, TOWER_ID, { kind: 'bench', slot: 0 });
    expect(moveUnit(player, makeContext(1), tower.id, { kind: 'board', cell: cellAt(0, 0) })).toMatchObject({ ok: true });
    expect(boardFightersOf(player)).toHaveLength(3);
  });

  it('com a torre em campo, ainda cabem todos os lutadores do limite', () => {
    const player = makePlayer();
    giveUnit(player, TOWER_ID, { kind: 'board', cell: cellAt(0, 0) });
    const fighters = [0, 1, 2].map((slot) => giveUnit(player, 'bixo', { kind: 'bench', slot }));
    const results = fighters.map((fighter, column) => moveUnit(player, makeContext(1), fighter.id, { kind: 'board', cell: cellAt(column, 5) }));
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('trocar a torre por um lutador da reserva não fura o limite, em nenhum dos dois sentidos', () => {
    const player = playerWithFullTeam();
    const tower = giveUnit(player, TOWER_ID, { kind: 'board', cell: cellAt(0, 0) });
    const reserve = giveUnit(player, 'leo', { kind: 'bench', slot: 0 });
    const full = { ok: false, reason: 'board_full' };
    expect(moveUnit(player, makeContext(1), reserve.id, tower.location)).toEqual(full);
    expect(moveUnit(player, makeContext(1), tower.id, reserve.location)).toEqual(full);
    expect(boardFightersOf(player)).toHaveLength(3);
  });

  it('um quarto lutador continua barrado', () => {
    const player = playerWithFullTeam();
    const reserve = giveUnit(player, 'leo', { kind: 'bench', slot: 0 });
    expect(moveUnit(player, makeContext(1), reserve.id, { kind: 'board', cell: cellAt(3, 5) })).toEqual({ ok: false, reason: 'board_full' });
  });

  it('o bot que tem uma torre leva o time completo e a torre', () => {
    const game = makeGame();
    const bot = game.getPlayer('p1');
    [0, 1, 2].forEach((slot) => giveUnit(bot, 'bixo', { kind: 'bench', slot }));
    giveUnit(bot, 'leo', { kind: 'bench', slot: 3 });
    giveUnit(bot, TOWER_ID, { kind: 'bench', slot: 4 });
    bot.coins = 0;
    playBotPreparation(game, 'p1');
    expect(boardFightersOf(bot)).toHaveLength(game.unitLimit);
    expect(bot.units.find((unit) => unit.characterId === TOWER_ID)?.location.kind).toBe('board');
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
  it('entra como estrutura: não se move, não ataca, e é atacada mesmo quando só ela resta de um lado', () => {
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
    // Só há torre de um lado: o combate segue até ela cair. A torre não conta como unidade viva.
    expect(result.winner).toBe('B');
    expect(result.aliveCountBySide.A).toBe(0);
    expect(result.destroyedStructureIds).toEqual([specs[0]!.id]);
    const events = simulation.drainEvents();
    expect(events.some((event) => (event.type === 'move' || event.type === 'attack') && (event.type === 'move' ? event.unitId : event.attackerId) === specs[0]!.id)).toBe(false);
  });

  it('os inimigos só miram na torre quando não sobra ninguém do time, mesmo que ela esteja mais perto', () => {
    const towerStats = { health: 4, damage: 1, attackSpeed: 1, range: 1, mobility: 1 };
    const fighterStats = { health: 2, damage: 1, attackSpeed: 1, range: 1, mobility: 1 };
    const joao = game.getCharacter('joao_lucas');
    const units = [
      { id: 'A-torre', name: 'Torre', side: 'A' as const, cell: cellAt(2, 5), stats: towerStats, isStructure: true },
      { id: 'A-longe', name: 'Reserva', side: 'A' as const, cell: cellAt(2, 1), stats: fighterStats },
      { id: 'B-joao', name: 'João', side: 'B' as const, cell: cellAt(2, 7), stats: joao.stats, behavior: joao.behavior },
    ];
    const simulation = new CombatSimulation({ seed: 'torre-por-ultimo', units });
    simulation.run();
    const events = simulation.drainEvents();
    const deathOfFighter = events.findIndex((event) => event.type === 'death' && event.unitId === 'A-longe');
    const firstHitOnTower = events.findIndex((event) => event.type === 'attack' && event.targetId === 'A-torre');
    expect(deathOfFighter).toBeGreaterThanOrEqual(0);
    expect(firstHitOnTower).toBeGreaterThan(deathOfFighter);
  });

  it('uma torre que apanha até morrer aparece em destroyedStructureIds e não entre os sobreviventes', () => {
    const stats = { health: 1, damage: 1, attackSpeed: 1, range: 1, mobility: 1 };
    const joao = game.getCharacter('joao_lucas');
    const units = [
      { id: 'A-torre', name: 'Torre', side: 'A' as const, cell: cellAt(2, 3), stats, isStructure: true },
      { id: 'A-fraco', name: 'Fraco', side: 'A' as const, cell: cellAt(2, 5), stats },
      { id: 'B-joao', name: 'João', side: 'B' as const, cell: cellAt(2, 7), stats: joao.stats, behavior: joao.behavior },
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

describe('torres personalizadas', () => {
  const withActiveVariants = {
    ...DEFAULT_GAME_CONFIG,
    tower: { ...towerConfig, variants: towerConfig.variants.map((variant) => ({ ...variant, active: true })) },
  };
  const roster = new Map([...DEFAULT_CHARACTERS, ...buildTowerCharacters(withActiveVariants.tower)].map((character) => [character.id, character]));
  const towerBuffsById = new Map(towerDefinitionsOf(withActiveVariants.tower).map((tower) => [tower.id, tower.buffs]));
  const setupContext = { charactersById: roster, synergies: DEFAULT_SYNERGIES, synergyMapping: INITIAL_SYNERGY_MAPPING, towerBuffsById };

  const unitsWith = (...towers: { id: string; cell: ReturnType<typeof cellAt> }[]) => {
    const player = makePlayer();
    const near = giveUnit(player, 'bixo', { kind: 'board', cell: cellAt(1, 3) });
    const far = giveUnit(player, 'vinicius', { kind: 'board', cell: cellAt(4, 5) });
    towers.forEach((tower) => giveUnit(player, tower.id, { kind: 'board', cell: tower.cell }));
    const specs = buildSideUnits(player, 'B', setupContext);
    const unitOf = (owned: { id: string }) => createCombatUnit(specs.find((spec) => spec.id === `B-${owned.id}`)!);
    return { near: unitOf(near), far: unitOf(far), specs };
  };

  it('o bônus vale só para quem está ao alcance da torre, mesmo com o lado espelhado', () => {
    const plain = unitsWith();
    const buffed = unitsWith({ id: 'torre_cafe', cell: cellAt(1, 2) });
    expect(buffed.near.stats.attacksPerSecond).toBeCloseTo(plain.near.stats.attacksPerSecond * 1.12);
    expect(buffed.far.stats.attacksPerSecond).toBeCloseTo(plain.far.stats.attacksPerSecond);
  });

  it('bônus de vida aumenta a vida máxima e a vida inicial; a regeneração também chega', () => {
    const plain = unitsWith();
    const buffed = unitsWith({ id: 'torre_enfermaria', cell: cellAt(1, 2) });
    expect(buffed.near.stats.maxHealth).toBeCloseTo(plain.near.stats.maxHealth * 1.15);
    expect(buffed.near.health).toBeCloseTo(buffed.near.stats.maxHealth);
    expect(buffed.near.regenIntervalMs).toBe(3000);
    expect(buffed.far.stats.maxHealth).toBeCloseTo(plain.far.stats.maxHealth);
  });

  it('sem raio, o bônus alcança o time inteiro; a própria torre não recebe nada e usa o próprio sprite', () => {
    const everywhere = new Map(towerBuffsById).set('torre_cafe', [{ effect: { type: 'attribute_multiplier' as const, attribute: 'damage' as const, value: 2 } }]);
    const player = makePlayer();
    const far = giveUnit(player, 'vinicius', { kind: 'board', cell: cellAt(4, 5) });
    const tower = giveUnit(player, 'torre_cafe', { kind: 'board', cell: cellAt(0, 0) });
    const specs = buildSideUnits(player, 'A', { ...setupContext, towerBuffsById: everywhere });
    const plain = unitsWith().far;
    expect(createCombatUnit(specs.find((spec) => spec.id === `A-${far.id}`)!).stats.damage).toBeCloseTo(plain.stats.damage * 2);
    const towerUnit = createCombatUnit(specs.find((spec) => spec.id === `A-${tower.id}`)!);
    expect(towerUnit).toMatchObject({ isStructure: true, auxiliarySpriteKey: 'torre_cafe' });
  });

  it('a loja sorteia entre as torres ativas, com o preço de cada uma, e o máximo vale para todas juntas', () => {
    const context = { ...makeContext(), config: { ...withActiveVariants, tower: { ...withActiveVariants.tower, offerChancePercent: 100, maximumOwned: 2 } } };
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const player = makePlayer();
      refillShop(player, { ...context, towerRandom: new SeededRandom(`variantes-${seed}`) });
      const towers = player.shop.filter((offer) => offer && isTowerId(offer.characterId));
      expect(towers).toHaveLength(2);
      for (const offer of towers) {
        seen.add(offer!.characterId);
        expect(offer!.cost).toBe(towerDefinitionOf(withActiveVariants.tower, offer!.characterId).cost);
      }
    }
    expect([...seen].sort()).toEqual(['torre', 'torre_cafe', 'torre_enfermaria']);
  });

  it('desligadas, elas não aparecem na loja', () => {
    expect(offeredTowersOf(towerConfig).map((tower) => tower.id)).toEqual([TOWER_ID]);
  });

  it('cada tipo rende o próprio valor', () => {
    const player = makePlayer();
    giveUnit(player, TOWER_ID, { kind: 'board', cell: cellAt(0, 0) });
    giveUnit(player, 'torre_cafe', { kind: 'board', cell: cellAt(1, 0) });
    giveUnit(player, 'torre_enfermaria', { kind: 'board', cell: cellAt(2, 0) });
    expect(towerIncomeOf(player, withActiveVariants.tower)).toBe(towerConfig.incomePerRound + 1);
  });

  it('o texto da carta conta os bônus e o alcance', () => {
    const cafe = buildTowerCharacter(towerDefinitionOf(withActiveVariants.tower, 'torre_cafe'));
    expect(cafe.ability.description).toContain('+12% de velocidade de ataque (aliados a até 2 casas)');
    const infirmary = buildTowerCharacter(towerDefinitionOf(withActiveVariants.tower, 'torre_enfermaria'));
    expect(infirmary.ability.description).not.toContain('por rodada enquanto');
    expect(cafe.ability.description).toContain('Rende +1 moeda por rodada');
  });

  it('o cadastro recusa ids e nomes repetidos', () => {
    const [first] = towerConfig.variants;
    expect(gameConfigSchema.safeParse({ ...DEFAULT_GAME_CONFIG, tower: { ...towerConfig, variants: [first!, first!] } }).success).toBe(false);
    expect(gameConfigSchema.safeParse({ ...DEFAULT_GAME_CONFIG, tower: { ...towerConfig, variants: [{ ...first!, name: 'Torre' }] } }).success).toBe(false);
  });
});
