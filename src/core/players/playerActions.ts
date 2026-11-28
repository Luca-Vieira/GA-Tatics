import type { CharacterDefinition } from '@data/schemas/character';
import type { GameConfig } from '@data/schemas/gameConfig';
import { cellsOfSide, isInsideBoard, sideOfCell } from '@shared/constants/board';
import { hexesAreEqual, type Hex } from '@shared/utils/hex';
import type { SeededRandom } from '@shared/utils/random';
import { fuseAll, wouldCompleteFusion, type FusionResult } from '../fusion/fusion';
import { unitLimitForRound } from '../rounds/rounds';
import { rollShopOffer, sellValueOf } from '../shop/shop';
import { boardFightersOf, countOwnedTowers, isTowerId, offeredTowersOf, type TowerDefinition } from '../tower/tower';
import { benchUnitsOf, boardUnitsOf, isAlive, type OwnedUnit, type PlayerState, type UnitLocation } from './playerState';

/** Tudo de que as ações de um jogador precisam saber do jogo em andamento. */
export interface ActionContext {
  readonly config: GameConfig;
  readonly round: number;
  readonly roster: readonly CharacterDefinition[];
  /** Sorteio da loja do jogador nesta rodada; as atualizações continuam a mesma sequência. */
  readonly shopRandom: SeededRandom;
  /** Sorteio das torres na loja (separado do sorteio dos personagens, para o resto da loja não mudar). Sem ele, não aparecem torres. */
  readonly towerRandom?: SeededRandom;
}

export type ActionFailure =
  | 'not_in_preparation'
  | 'eliminated'
  | 'unknown_shop_slot'
  | 'shop_slot_empty'
  | 'not_enough_coins'
  | 'no_space'
  | 'unit_not_found'
  | 'invalid_destination'
  | 'board_full'
  | 'tower_limit'
  | 'player_not_in_combat'
  | 'spectator';

export type ActionResult = { readonly ok: true; readonly fusions: readonly FusionResult[] } | { readonly ok: false; readonly reason: ActionFailure };

function success(fusions: readonly FusionResult[] = []): ActionResult {
  return { ok: true, fusions };
}

function failure(reason: ActionFailure): ActionResult {
  return { ok: false, reason };
}

const OWN_HALF_CELLS = cellsOfSide('A');

/**
 * Sorteia a loja nova; as ofertas congeladas ficam onde estão (o sorteio é feito por inteiro, para a sequência não
 * depender do congelamento). Cada vaga sorteada pode virar uma torre, respeitando o máximo de torres por jogador.
 */
export function refillShop(player: PlayerState, context: ActionContext): void {
  const rolledOffers = rollShopOffer(context.shopRandom, context.roster, context.config.shop);
  const keptOffers = rolledOffers.map((_, slotIndex) => (player.shop[slotIndex]?.frozen ? player.shop[slotIndex] : undefined));
  let towersAround = countOwnedTowers(player) + keptOffers.filter((offer) => offer && isTowerId(offer.characterId)).length;
  player.shop = rolledOffers.map((rolledOffer, slotIndex) => {
    const keptOffer = keptOffers[slotIndex];
    if (keptOffer) {
      return keptOffer;
    }
    const tower = rollTowerOffer(context);
    if (tower && towersAround < context.config.tower.maximumOwned) {
      towersAround++;
      return { characterId: tower.id, cost: tower.cost };
    }
    return rolledOffer;
  });
}

/**
 * A torre que a vaga virou, se virou. Sempre gasta um sorteio por vaga (quando há sorteio de torres), para a sequência ser
 * a mesma qualquer que seja o resultado; o sorteio do tipo só acontece quando há mais de um na loja.
 */
function rollTowerOffer(context: ActionContext): TowerDefinition | null {
  if (!context.towerRandom) {
    return null;
  }
  if (context.towerRandom.next() * 100 >= context.config.tower.offerChancePercent) {
    return null;
  }
  const offered = offeredTowersOf(context.config.tower);
  return offered.length > 1 ? context.towerRandom.pick(offered) : offered[0]!;
}

/** Congela ou descongela uma oferta (de graça). */
export function toggleFreezeShopSlot(player: PlayerState, shopSlotIndex: number): ActionResult {
  if (!isAlive(player)) {
    return failure('eliminated');
  }
  if (shopSlotIndex < 0 || shopSlotIndex >= player.shop.length) {
    return failure('unknown_shop_slot');
  }
  const offer = player.shop[shopSlotIndex];
  if (!offer) {
    return failure('shop_slot_empty');
  }
  player.shop[shopSlotIndex] = { ...offer, frozen: !offer.frozen };
  return success();
}

export function refreshShop(player: PlayerState, context: ActionContext): ActionResult {
  if (!isAlive(player)) {
    return failure('eliminated');
  }
  const { refreshCost } = context.config.shop;
  if (player.coins < refreshCost) {
    return failure('not_enough_coins');
  }
  player.coins -= refreshCost;
  refillShop(player, context);
  return success();
}

/** Compra a oferta: a unidade vai para a reserva, depois para o tabuleiro; se tudo estiver cheio, só vale se completar uma fusão. */
export function buyFromShop(player: PlayerState, context: ActionContext, shopSlotIndex: number): ActionResult {
  if (!isAlive(player)) {
    return failure('eliminated');
  }
  if (shopSlotIndex < 0 || shopSlotIndex >= player.shop.length) {
    return failure('unknown_shop_slot');
  }
  const offer = player.shop[shopSlotIndex];
  if (!offer) {
    return failure('shop_slot_empty');
  }
  if (player.coins < offer.cost) {
    return failure('not_enough_coins');
  }
  if (isTowerId(offer.characterId) && countOwnedTowers(player) >= context.config.tower.maximumOwned) {
    return failure('tower_limit');
  }
  const location = findLocationForNewUnit(player, context, offer.characterId);
  if (!location) {
    return failure('no_space');
  }

  player.coins -= offer.cost;
  player.shop[shopSlotIndex] = null;
  const serial = ++player.unitSerial;
  player.units.push({ id: `${player.id}-u${serial}`, characterId: offer.characterId, starLevel: 1, acquiredOrder: serial, location });
  return success(fuseAll(player));
}

export function sellUnit(player: PlayerState, context: ActionContext, unitId: string): ActionResult {
  if (!isAlive(player)) {
    return failure('eliminated');
  }
  const unit = player.units.find((candidate) => candidate.id === unitId);
  if (!unit) {
    return failure('unit_not_found');
  }
  player.units = player.units.filter((candidate) => candidate.id !== unitId);
  player.coins += sellValueOf(context.config.shop, unit.starLevel);
  return success();
}

/** Move uma unidade para uma casa da própria metade ou para um espaço da reserva; se o destino estiver ocupado, as duas trocam de lugar. */
export function moveUnit(player: PlayerState, context: ActionContext, unitId: string, destination: UnitLocation): ActionResult {
  if (!isAlive(player)) {
    return failure('eliminated');
  }
  const unit = player.units.find((candidate) => candidate.id === unitId);
  if (!unit) {
    return failure('unit_not_found');
  }
  if (!isValidDestination(destination, context.config.rounds.benchSize)) {
    return failure('invalid_destination');
  }
  const occupant = player.units.find((candidate) => candidate.id !== unit.id && locationsAreEqual(candidate.location, destination));
  if (exceedsUnitLimit(player, context, unit, destination, occupant)) {
    return failure('board_full');
  }

  if (occupant) {
    occupant.location = unit.location;
  }
  unit.location = destination;
  return success();
}

/**
 * Verdadeiro se o movimento (com a troca, quando o destino está ocupado) puser no tabuleiro mais lutadores do que a
 * rodada permite. Torres não contam, então trocar uma torre por um lutador da reserva também é conferido.
 */
function exceedsUnitLimit(player: PlayerState, context: ActionContext, unit: OwnedUnit, destination: UnitLocation, occupant: OwnedUnit | undefined): boolean {
  const boardPresence = (location: UnitLocation) => (location.kind === 'board' ? 1 : 0);
  const fighterWeight = (candidate: OwnedUnit) => (isTowerId(candidate.characterId) ? 0 : 1);
  const unitChange = fighterWeight(unit) * (boardPresence(destination) - boardPresence(unit.location));
  const occupantChange = occupant ? fighterWeight(occupant) * (boardPresence(unit.location) - boardPresence(destination)) : 0;
  const addedFighters = unitChange + occupantChange;
  return addedFighters > 0 && boardFightersOf(player).length + addedFighters > unitLimitForRound(context.config.rounds, context.round);
}

export function locationsAreEqual(first: UnitLocation, second: UnitLocation): boolean {
  if (first.kind === 'board' && second.kind === 'board') {
    return hexesAreEqual(first.cell, second.cell);
  }
  if (first.kind === 'bench' && second.kind === 'bench') {
    return first.slot === second.slot;
  }
  return false;
}

function isValidDestination(destination: UnitLocation, benchSize: number): boolean {
  if (destination.kind === 'bench') {
    return Number.isInteger(destination.slot) && destination.slot >= 0 && destination.slot < benchSize;
  }
  return isInsideBoard(destination.cell) && sideOfCell(destination.cell) === 'A';
}

/** Onde colocar a unidade recém-comprada, ou `null` se não houver espaço. */
function findLocationForNewUnit(player: PlayerState, context: ActionContext, characterId: string): UnitLocation | null {
  const { benchSize } = context.config.rounds;
  const freeBenchSlot = firstFreeBenchSlot(player, benchSize);
  if (freeBenchSlot !== null) {
    return { kind: 'bench', slot: freeBenchSlot };
  }
  const hasRoomOnBoard = isTowerId(characterId) || boardFightersOf(player).length < unitLimitForRound(context.config.rounds, context.round);
  const freeCell = hasRoomOnBoard ? firstFreeBoardCell(player) : null;
  if (freeCell) {
    return { kind: 'board', cell: freeCell };
  }
  // Tudo cheio: a compra só vale se a nova cópia completar uma fusão (a unidade some na hora, então o espaço extra é virtual).
  return wouldCompleteFusion(player, characterId) ? { kind: 'bench', slot: benchSize } : null;
}

function firstFreeBenchSlot(player: PlayerState, benchSize: number): number | null {
  const usedSlots = new Set(benchUnitsOf(player).map((unit) => (unit.location.kind === 'bench' ? unit.location.slot : -1)));
  for (let slot = 0; slot < benchSize; slot++) {
    if (!usedSlots.has(slot)) {
      return slot;
    }
  }
  return null;
}

function firstFreeBoardCell(player: PlayerState): Hex | null {
  const occupiedCells = boardUnitsOf(player).map((unit: OwnedUnit) => (unit.location.kind === 'board' ? unit.location.cell : null));
  return OWN_HALF_CELLS.find((cell) => !occupiedCells.some((occupied) => occupied !== null && hexesAreEqual(occupied, cell))) ?? null;
}
