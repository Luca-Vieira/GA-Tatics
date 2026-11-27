import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '@data/defaults/gameConfig';
import { cellAt, giveUnit, makeContext, makePlayer, offerShop } from '../testSupport';
import { buyFromShop, moveUnit, refreshShop, sellUnit, toggleFreezeShopSlot } from './playerActions';
import { benchUnitsOf, boardUnitsOf } from './playerState';

describe('compra', () => {
  it('desconta o custo, esvazia a oferta e põe a unidade na reserva', () => {
    const player = makePlayer();
    player.coins = 10;
    offerShop(player, 'bixo', 'helder', 'joao_lucas');
    const result = buyFromShop(player, makeContext(), 0);
    expect(result.ok).toBe(true);
    expect(player.coins).toBe(7);
    expect(player.shop[0]).toBeNull();
    expect(player.units).toHaveLength(1);
    expect(player.units[0]!.location).toEqual({ kind: 'bench', slot: 0 });
  });

  it('custa 3 moedas para comum e 4 para raro e especial', () => {
    const player = makePlayer();
    player.coins = 100;
    offerShop(player, 'bixo', 'helder', 'joao_lucas');
    buyFromShop(player, makeContext(), 0);
    buyFromShop(player, makeContext(), 1);
    buyFromShop(player, makeContext(), 2);
    expect(player.coins).toBe(100 - 3 - 4 - 4);
  });

  it('recusa sem moedas suficientes', () => {
    const player = makePlayer();
    player.coins = 2;
    offerShop(player, 'bixo');
    expect(buyFromShop(player, makeContext(), 0)).toEqual({ ok: false, reason: 'not_enough_coins' });
    expect(player.units).toHaveLength(0);
  });

  it('recusa oferta vazia e posição inexistente', () => {
    const player = makePlayer();
    player.coins = 10;
    offerShop(player, 'bixo');
    buyFromShop(player, makeContext(), 0);
    expect(buyFromShop(player, makeContext(), 0)).toEqual({ ok: false, reason: 'shop_slot_empty' });
    expect(buyFromShop(player, makeContext(), 7)).toEqual({ ok: false, reason: 'unknown_shop_slot' });
  });

  /** Um personagem diferente por vaga da reserva (6 vagas). */
  const FULL_BENCH = ['bixo', 'vinicius', 'leo', 'marquinhos', 'derson', 'joao_lucas'];

  it('com a reserva cheia, a unidade vai para o tabuleiro se houver vaga', () => {
    const player = makePlayer();
    player.coins = 10;
    FULL_BENCH.forEach((id, slot) => giveUnit(player, id, { kind: 'bench', slot }));
    offerShop(player, 'felipao');
    buyFromShop(player, makeContext(1), 0);
    expect(boardUnitsOf(player)).toHaveLength(1);
  });

  it('com reserva e tabuleiro cheios (rodada 1 = 3 unidades), a compra é bloqueada', () => {
    const player = makePlayer();
    player.coins = 10;
    FULL_BENCH.forEach((id, slot) => giveUnit(player, id, { kind: 'bench', slot }));
    ['felipao', 'matheus', 'wilian'].forEach((id, column) => giveUnit(player, id, { kind: 'board', cell: cellAt(column, 3) }));
    offerShop(player, 'helder');
    expect(buyFromShop(player, makeContext(1), 0)).toEqual({ ok: false, reason: 'no_space' });
    expect(player.coins).toBe(10);
  });

  it('com tudo cheio, a compra que completa uma fusão é permitida', () => {
    const player = makePlayer();
    player.coins = 10;
    ['bixo', 'bixo', 'leo', 'marquinhos', 'derson', 'joao_lucas'].forEach((id, slot) => giveUnit(player, id, { kind: 'bench', slot }));
    ['felipao', 'matheus', 'wilian'].forEach((id, column) => giveUnit(player, id, { kind: 'board', cell: cellAt(column, 3) }));
    offerShop(player, 'bixo');
    const result = buyFromShop(player, makeContext(1), 0);
    expect(result.ok).toBe(true);
    const bixos = player.units.filter((unit) => unit.characterId === 'bixo');
    expect(bixos).toHaveLength(1);
    expect(bixos[0]!.starLevel).toBe(2);
    expect(benchUnitsOf(player)).toHaveLength(5);
  });
});

describe('fusão', () => {
  it('três iguais viram uma de 2 estrelas na posição da primeira (tabuleiro antes da reserva)', () => {
    const player = makePlayer();
    player.coins = 20;
    giveUnit(player, 'bixo', { kind: 'bench', slot: 0 });
    giveUnit(player, 'bixo', { kind: 'board', cell: cellAt(2, 3) });
    offerShop(player, 'bixo');
    const result = buyFromShop(player, makeContext(), 0);
    expect(result.ok && result.fusions).toHaveLength(1);
    expect(player.units).toHaveLength(1);
    expect(player.units[0]).toMatchObject({ characterId: 'bixo', starLevel: 2, location: { kind: 'board', cell: cellAt(2, 3) } });
  });

  it('fusões em cadeia: três de 2 estrelas formam uma de 3', () => {
    const player = makePlayer();
    player.coins = 20;
    giveUnit(player, 'leo', { kind: 'board', cell: cellAt(0, 3) }, 2);
    giveUnit(player, 'leo', { kind: 'board', cell: cellAt(1, 3) }, 2);
    giveUnit(player, 'leo', { kind: 'bench', slot: 0 });
    giveUnit(player, 'leo', { kind: 'bench', slot: 1 });
    offerShop(player, 'leo');
    const result = buyFromShop(player, makeContext(), 0);
    expect(result.ok && result.fusions.map((fusion) => fusion.resultStarLevel)).toEqual([2, 3]);
    expect(player.units).toHaveLength(1);
    expect(player.units[0]!.starLevel).toBe(3);
  });

  it('personagens diferentes ou níveis diferentes não se fundem', () => {
    const player = makePlayer();
    player.coins = 20;
    giveUnit(player, 'bixo', { kind: 'bench', slot: 0 });
    giveUnit(player, 'bixo', { kind: 'bench', slot: 1 }, 2);
    offerShop(player, 'leo', 'bixo');
    buyFromShop(player, makeContext(), 0);
    buyFromShop(player, makeContext(), 1);
    expect(player.units).toHaveLength(4);
  });
});

describe('venda', () => {
  it('devolve 1, 3 e 8 moedas conforme a estrela', () => {
    const player = makePlayer();
    const oneStar = giveUnit(player, 'bixo', { kind: 'bench', slot: 0 });
    const twoStars = giveUnit(player, 'leo', { kind: 'bench', slot: 1 }, 2);
    const threeStars = giveUnit(player, 'helder', { kind: 'bench', slot: 2 }, 3);
    sellUnit(player, makeContext(), oneStar.id);
    expect(player.coins).toBe(1);
    sellUnit(player, makeContext(), twoStars.id);
    expect(player.coins).toBe(4);
    sellUnit(player, makeContext(), threeStars.id);
    expect(player.coins).toBe(12);
    expect(player.units).toHaveLength(0);
  });

  it('recusa unidade inexistente', () => {
    expect(sellUnit(makePlayer(), makeContext(), 'nada')).toEqual({ ok: false, reason: 'unit_not_found' });
  });
});

describe('atualizar a loja', () => {
  const offerSize = DEFAULT_GAME_CONFIG.shop.offerSize;

  it('custa 1 moeda e sorteia novas ofertas', () => {
    const player = makePlayer();
    player.coins = 5;
    expect(refreshShop(player, makeContext())).toMatchObject({ ok: true });
    expect(player.coins).toBe(4);
    expect(player.shop).toHaveLength(offerSize);
  });

  it('recusa sem moedas', () => {
    const player = makePlayer();
    player.coins = 0;
    expect(refreshShop(player, makeContext())).toEqual({ ok: false, reason: 'not_enough_coins' });
  });
});

describe('posicionamento', () => {
  it('move da reserva para uma casa livre da própria metade', () => {
    const player = makePlayer();
    const unit = giveUnit(player, 'bixo', { kind: 'bench', slot: 0 });
    expect(moveUnit(player, makeContext(), unit.id, { kind: 'board', cell: cellAt(2, 2) }).ok).toBe(true);
    expect(unit.location).toEqual({ kind: 'board', cell: cellAt(2, 2) });
  });

  it('recusa casas da metade adversária e espaços de reserva inexistentes', () => {
    const player = makePlayer();
    const unit = giveUnit(player, 'bixo', { kind: 'bench', slot: 0 });
    expect(moveUnit(player, makeContext(), unit.id, { kind: 'board', cell: cellAt(2, 6) })).toEqual({ ok: false, reason: 'invalid_destination' });
    expect(moveUnit(player, makeContext(), unit.id, { kind: 'bench', slot: 6 })).toEqual({ ok: false, reason: 'invalid_destination' });
  });

  it('respeita o limite de unidades do tabuleiro', () => {
    const player = makePlayer();
    ['felipao', 'matheus', 'wilian'].forEach((id, column) => giveUnit(player, id, { kind: 'board', cell: cellAt(column, 3) }));
    const extra = giveUnit(player, 'bixo', { kind: 'bench', slot: 0 });
    expect(moveUnit(player, makeContext(1), extra.id, { kind: 'board', cell: cellAt(4, 3) })).toEqual({ ok: false, reason: 'board_full' });
    expect(moveUnit(player, makeContext(2), extra.id, { kind: 'board', cell: cellAt(4, 3) }).ok).toBe(true);
  });

  it('destino ocupado: as duas unidades trocam de lugar, mesmo com o tabuleiro cheio', () => {
    const player = makePlayer();
    const onBoard = giveUnit(player, 'felipao', { kind: 'board', cell: cellAt(0, 3) });
    giveUnit(player, 'matheus', { kind: 'board', cell: cellAt(1, 3) });
    giveUnit(player, 'wilian', { kind: 'board', cell: cellAt(2, 3) });
    const onBench = giveUnit(player, 'bixo', { kind: 'bench', slot: 1 });
    expect(moveUnit(player, makeContext(1), onBench.id, onBoard.location).ok).toBe(true);
    expect(onBench.location).toEqual({ kind: 'board', cell: cellAt(0, 3) });
    expect(onBoard.location).toEqual({ kind: 'bench', slot: 1 });
  });
});

describe('congelar oferta da loja', () => {
  it('alterna o congelamento de graça e recusa posição inexistente ou oferta vazia', () => {
    const player = makePlayer();
    player.coins = 5;
    offerShop(player, 'bixo', 'helder');
    expect(toggleFreezeShopSlot(player, 0)).toMatchObject({ ok: true });
    expect(player.shop[0]?.frozen).toBe(true);
    expect(player.coins).toBe(5);
    toggleFreezeShopSlot(player, 0);
    expect(player.shop[0]?.frozen).toBe(false);

    expect(toggleFreezeShopSlot(player, 9)).toEqual({ ok: false, reason: 'unknown_shop_slot' });
    player.shop[1] = null;
    expect(toggleFreezeShopSlot(player, 1)).toEqual({ ok: false, reason: 'shop_slot_empty' });
  });

  it('a atualização da loja mantém as ofertas congeladas e troca as demais', () => {
    const offers = ['bixo', 'helder', 'joao_lucas'];
    let changedSomething = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const player = makePlayer();
      player.coins = 100;
      offerShop(player, ...offers);
      toggleFreezeShopSlot(player, 1);
      refreshShop(player, makeContext(1, `semente-${attempt}`));
      expect(player.shop[1]).toMatchObject({ characterId: 'helder', frozen: true });
      changedSomething ||= player.shop[0]?.characterId !== 'bixo' || player.shop[2]?.characterId !== 'joao_lucas';
    }
    expect(changedSomething).toBe(true);
  });

  it('comprar a oferta congelada a remove; a vaga volta a ser sorteada na próxima atualização', () => {
    const player = makePlayer();
    player.coins = 100;
    offerShop(player, 'bixo');
    toggleFreezeShopSlot(player, 0);
    buyFromShop(player, makeContext(), 0);
    expect(player.shop[0]).toBeNull();
    refreshShop(player, makeContext());
    expect(player.shop[0]).not.toBeNull();
    expect(player.shop[0]?.frozen).toBeUndefined();
  });

  it('sem moedas para atualizar, a loja congelada não muda', () => {
    const player = makePlayer();
    player.coins = 0;
    offerShop(player, 'bixo');
    toggleFreezeShopSlot(player, 0);
    expect(refreshShop(player, makeContext())).toEqual({ ok: false, reason: 'not_enough_coins' });
    expect(player.shop[0]?.frozen).toBe(true);
  });
});

