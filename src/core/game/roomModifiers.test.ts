import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '@data/defaults/gameConfig';
import { NO_ROOM_MODIFIERS, ROOM_MODIFIER_CHOICES, roomModifiersSchema } from '@data/schemas/roomModifiers';
import { cellAt, giveUnit, makeGame } from '../testSupport';
import { applyRoomModifiers, combatRulesOf, describeRoomModifiers, NORMAL_COMBAT_RULES } from './roomModifiers';

const everything = { extraLives: 2, extraPreparationSeconds: 20, extraCombatSeconds: 10, extraIncome: 3, statBonusPercent: 25 };

describe('modificadores de sala', () => {
  it('sem modificadores, nada muda', () => {
    expect(applyRoomModifiers(DEFAULT_GAME_CONFIG, NO_ROOM_MODIFIERS)).toEqual(DEFAULT_GAME_CONFIG);
    expect(combatRulesOf(NO_ROOM_MODIFIERS)).toEqual(NORMAL_COMBAT_RULES);
    expect(describeRoomModifiers(NO_ROOM_MODIFIERS)).toEqual([]);
  });

  it('soma vidas, tempos de preparação e a renda de cada rodada, sem mexer na configuração original', () => {
    const config = applyRoomModifiers(DEFAULT_GAME_CONFIG, everything);
    expect(config.rounds.startingLives).toBe(DEFAULT_GAME_CONFIG.rounds.startingLives + 2);
    expect(config.rounds.preparationSeconds).toBe(DEFAULT_GAME_CONFIG.rounds.preparationSeconds + 20);
    expect(config.rounds.shortPreparationSeconds).toBe(DEFAULT_GAME_CONFIG.rounds.shortPreparationSeconds + 20);
    expect(config.economy.incomeByRound).toEqual(DEFAULT_GAME_CONFIG.economy.incomeByRound.map((income) => income + 3));
    expect(config.shop).toEqual(DEFAULT_GAME_CONFIG.shop);
    expect(DEFAULT_GAME_CONFIG.rounds.startingLives).toBe(3);
  });

  it('as regras de combate somam tempo e multiplicam status', () => {
    expect(combatRulesOf(everything)).toEqual({ statMultiplier: 1.25, timeLimitMs: NORMAL_COMBAT_RULES.timeLimitMs + 10_000 });
  });

  it('descreve só as regras ativas', () => {
    expect(describeRoomModifiers(everything)).toEqual(['+2 vidas', '+20s de preparação', '+10s de combate', '+3 de moedas por rodada', '+25% de vida e dano']);
    expect(describeRoomModifiers({ ...NO_ROOM_MODIFIERS, extraLives: 1 })).toEqual(['+1 vida']);
  });

  it('o esquema aceita parciais, recusa valores fora do teto, campos extras e decimais', () => {
    expect(roomModifiersSchema.parse({ extraLives: 1 })).toEqual({ ...NO_ROOM_MODIFIERS, extraLives: 1 });
    expect(roomModifiersSchema.safeParse({ extraLives: 4 }).success).toBe(false);
    expect(roomModifiersSchema.safeParse({ statBonusPercent: 51 }).success).toBe(false);
    expect(roomModifiersSchema.safeParse({ extraLives: 1.5 }).success).toBe(false);
    expect(roomModifiersSchema.safeParse({ extraLives: -1 }).success).toBe(false);
    expect(roomModifiersSchema.safeParse({ bonusSecreto: 1 }).success).toBe(false);
  });

  it('todas as opções oferecidas no saguão são aceitas pelo esquema', () => {
    for (const [field, values] of Object.entries(ROOM_MODIFIER_CHOICES)) {
      for (const value of values) {
        expect(roomModifiersSchema.safeParse({ [field]: value }).success, `${field}=${value}`).toBe(true);
      }
    }
  });
});

describe('modificadores na partida', () => {
  const combatOf = (game: ReturnType<typeof makeGame>) => {
    giveUnit(game.getPlayer('p1'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(game.getPlayer('p2'), 'helder', { kind: 'board', cell: cellAt(2, 3) });
    const duel = game.resolveCombats().find((candidate) => candidate.topId === 'p1' || candidate.bottomId === 'p1')!;
    return duel.combatConfig;
  };

  it('"mais status" multiplica a vida e o dano das unidades do combate', () => {
    const normal = combatOf(makeGame());
    const boosted = combatOf(makeGame({ combatRules: combatRulesOf({ ...NO_ROOM_MODIFIERS, statBonusPercent: 50 }) }));
    const bixoOf = (config: typeof normal) => config.units.find((unit) => unit.characterId === 'bixo')!;
    expect(bixoOf(boosted).stats.health).toBeCloseTo(bixoOf(normal).stats.health * 1.5);
    expect(bixoOf(boosted).stats.damage).toBeCloseTo(bixoOf(normal).stats.damage * 1.5);
    expect(bixoOf(boosted).stats.range).toBe(bixoOf(normal).stats.range);
  });

  it('"mais tempo de combate" vai no limite do combate; sem a regra, vale o limite padrão', () => {
    expect(combatOf(makeGame()).timeLimitMs).toBeUndefined();
    const config = combatOf(makeGame({ combatRules: combatRulesOf({ ...NO_ROOM_MODIFIERS, extraCombatSeconds: 20 }) }));
    expect(config.timeLimitMs).toBe(50_000);
  });

  it('vidas, tempo de preparação e renda da sala entram pela configuração', () => {
    const game = makeGame({ config: applyRoomModifiers(DEFAULT_GAME_CONFIG, everything) });
    expect(game.getPlayer('p1').lives).toBe(5);
    expect(game.getPlayer('p1').coins).toBe(5 + 3);
    expect(game.preparationSeconds).toBe(DEFAULT_GAME_CONFIG.rounds.preparationSeconds + 20);
  });

  it('as unidades de uma partida com bônus lutam mais tempo antes do limite (o limite maior é respeitado)', () => {
    const game = makeGame({ combatRules: combatRulesOf({ ...NO_ROOM_MODIFIERS, extraCombatSeconds: 30 }) });
    giveUnit(game.getPlayer('p1'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(game.getPlayer('p2'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    const duels = game.resolveCombats();
    const longest = Math.max(...duels.map((duel) => duel.result.durationMs));
    expect(longest).toBeLessThanOrEqual(60_000);
  });
});
