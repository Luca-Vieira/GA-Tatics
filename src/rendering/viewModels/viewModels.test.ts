import { describe, expect, it } from 'vitest';
import { HEALTH_PER_POINT } from '@combat/units/stats';
import { cellAt, giveUnit, makeGame } from '@core/testSupport';
import { buildEndScreen, buildInfoModel, buildRoundResultScreen, buildShopModel, buildSynergyModel, buildTopBarModel } from './viewModels';

describe('modelos de interface', () => {
  it('a loja mostra o custo, a sinergia e se dá para pagar', () => {
    const game = makeGame();
    const player = game.getPlayer('p1');
    player.shop = [{ characterId: 'joao_lucas', cost: 5 }, null, { characterId: 'bixo', cost: 3 }];
    player.coins = 3;
    const model = buildShopModel(game, 'p1');
    expect(model.cards[0]).toMatchObject({ name: 'João Lucas', cost: 5, synergyName: 'Gestão', canAfford: false });
    expect(model.cards[1]).toBeNull();
    expect(model.cards[2]).toMatchObject({ name: 'Bixo', synergyName: 'Operacional', canAfford: true, advancesFusion: false });
    expect(model.coins).toBe(3);
  });

  it('avisa quando comprar avança uma fusão', () => {
    const game = makeGame();
    const player = game.getPlayer('p1');
    giveUnit(player, 'bixo', { kind: 'bench', slot: 0 });
    player.shop = [{ characterId: 'bixo', cost: 3 }];
    expect(buildShopModel(game, 'p1').cards[0]?.advancesFusion).toBe(true);
  });

  it('o painel de sinergias conta só o tabuleiro e descreve o bônus ativo', () => {
    const game = makeGame();
    const player = game.getPlayer('p1');
    giveUnit(player, 'vinicius', { kind: 'board', cell: cellAt(1, 3) });
    giveUnit(player, 'leo', { kind: 'board', cell: cellAt(2, 3) });
    giveUnit(player, 'matheus', { kind: 'bench', slot: 0 });
    const model = buildSynergyModel(game, 'p1', Date.parse('2026-01-01T12:00:00Z'));
    const chaos = model.rows.find((row) => row.name === 'Caos')!;
    expect(chaos).toMatchObject({ count: 2, activeTierIndex: 0, isPreview: false });
    expect(chaos.effectLines).toEqual(['+5% de dano', '+3% de velocidade de ataque']);
    expect(chaos.memberNames).toEqual(['Derson', 'Leo', 'Matheus', 'Moço', 'Vinícius']);
    expect(model.rotationLabel).toContain('próxima troca em');
  });

  it('o detalhe do personagem usa os valores de jogo (com a estrela) e a habilidade', () => {
    const game = makeGame();
    const model = buildInfoModel(game, 'bixo', 2, 3);
    expect(model.stats[0]).toMatchObject({ label: 'Vida', displayValue: String(10 * HEALTH_PER_POINT * 2.5) });
    expect(model.abilityName).toBe('Descansar, né');
    expect(model.sellValue).toBe(3);
    expect(buildInfoModel(game, 'bixo', null, null).sellValue).toBeNull();
  });

  it('a barra superior marca o adversário e quem foi eliminado', () => {
    const game = makeGame();
    game.getPlayer('p4').eliminatedInRound = 1;
    const model = buildTopBarModel(game, 'p1', '30', 'Preparação');
    expect(model.players.find((player) => player.isOpponent)?.name).toBe('Jogador 2');
    expect(model.players.find((player) => player.isEliminated)?.name).toBe('Jogador 4');
    expect(model.players.find((player) => player.isYou)?.name).toContain('(você)');
  });

  it('a tela de resultado conta a derrota, as vidas e os outros duelos', () => {
    const game = makeGame({ bottomPlayerId: 'p1' });
    giveUnit(game.getPlayer('p2'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    game.resolveCombats();
    const summary = game.concludeRound();
    const screen = buildRoundResultScreen(game, summary, 'p1', 4.2);
    expect(screen.title).toBe('Derrota');
    expect(screen.lines[0]).toContain('Você perdeu 1 vida (restam 2)');
    expect(screen.buttonLabel).toBe('Continuar (5)');
    expect(screen.lines.join(' ')).toContain('Jogador 3');
  });

  it('a tela final lista a colocação de todos', () => {
    const game = makeGame({ players: [{ id: 'p1', name: 'Ana', isBot: true }, { id: 'p2', name: 'Beto', isBot: true }] });
    giveUnit(game.getPlayer('p1'), 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    for (let round = 1; round <= 3; round++) {
      game.resolveCombats();
      game.concludeRound();
      if (!game.isFinished) game.startNextRound();
    }
    const screen = buildEndScreen(game, 'p1');
    expect(screen.title).toBe('Você venceu!');
    expect(screen.lines.join('\n')).toContain('2º  Beto · eliminado na rodada 3');
  });
});
