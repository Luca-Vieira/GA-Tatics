import { hexesAreEqual, offsetToAxial, type Hex } from '@shared/utils/hex';
import type { Game } from '../game/Game';
import { isTowerId } from '../tower/tower';
import { benchUnitsOf, boardUnitsOf, type OwnedUnit, type PlayerState, type UnitLocation } from './playerState';

/** Quem tem alcance até aqui fica na frente; os demais ficam atrás. */
const MELEE_MAXIMUM_RANGE = 2;
const FRONT_ROWS = [5, 4];
const BACK_ROWS = [3, 2];
/** Colunas do centro para as bordas, para a formação ficar compacta. */
const COLUMNS_FROM_CENTER = [2, 1, 3, 0, 4];
const MAXIMUM_ORGANIZATION_PASSES = 12;

/**
 * Bot simples (decisoes-de-design.md, Seção 8): compra primeiro o que completa ou avança uma fusão e depois
 * o que a loja oferecer e couber no bolso, põe os melhores no tabuleiro (corpo a corpo na frente, à distância atrás) e fica pronto.
 */
export function playBotPreparation(game: Game, botId: string): void {
  buyAffordableOffers(game, botId);
  organizeBoard(game, botId);
  game.setReady(botId, true);
}

function buyAffordableOffers(game: Game, botId: string): void {
  const bot = game.getPlayer(botId);
  let purchaseMade = true;
  while (purchaseMade) {
    purchaseMade = false;
    const slotIndex = chooseOfferToBuy(game, bot);
    if (slotIndex !== null && game.buy(botId, slotIndex).ok) {
      purchaseMade = true;
    }
  }
}

/**
 * Ofertas que repetem um personagem já possuído vêm antes; depois, a ordem da loja (assim o bot experimenta o elenco
 * todo, e não só os mais baratos). Personagem novo só enquanto a equipe tem até uma unidade além do limite do tabuleiro.
 */
function chooseOfferToBuy(game: Game, bot: PlayerState): number | null {
  const ownedCharacterIds = new Set(bot.units.map((unit) => unit.characterId));
  const wantsNewCharacters = bot.units.filter((unit) => !isTowerId(unit.characterId)).length <= game.unitLimit;
  const isOwned = (characterId: string) => ownedCharacterIds.has(characterId);
  const candidates = bot.shop
    .map((offer, slotIndex) => ({ offer, slotIndex }))
    .filter((entry) => entry.offer !== null && entry.offer.cost <= bot.coins && !isTowerId(entry.offer.characterId))
    .filter((entry) => wantsNewCharacters || isOwned(entry.offer?.characterId ?? ''))
    .sort((first, second) => {
      const firstRank = isOwned(first.offer?.characterId ?? '') ? 0 : 1;
      const secondRank = isOwned(second.offer?.characterId ?? '') ? 0 : 1;
      return firstRank - secondRank || first.slotIndex - second.slotIndex;
    });
  // Só tenta o que cabe: compras que falham (sem espaço) não podem prender o laço.
  const affordableAndFitting = candidates.find((entry) => canFit(game, bot, entry.offer?.characterId ?? ''));
  return affordableAndFitting?.slotIndex ?? null;
}

function canFit(game: Game, bot: PlayerState, characterId: string): boolean {
  const hasBenchSpace = benchUnitsOf(bot).length < game.config.rounds.benchSize;
  const hasBoardSpace = boardUnitsOf(bot).length < game.unitLimit;
  const copies = bot.units.filter((unit) => unit.characterId === characterId && unit.starLevel === 1).length;
  return hasBenchSpace || hasBoardSpace || copies === 2;
}

function organizeBoard(game: Game, botId: string): void {
  const bot = game.getPlayer(botId);
  const unitsToDeploy = chooseUnitsToDeploy(game, bot);
  const targetCells = assignCells(game, unitsToDeploy);
  const deployedIds = new Set(unitsToDeploy.map((unit) => unit.id));

  for (let pass = 0; pass < MAXIMUM_ORGANIZATION_PASSES; pass++) {
    const misplaced = unitsToDeploy.find((unit) => !isAtCell(unit, targetCells.get(unit.id)));
    if (!misplaced) {
      break;
    }
    const cell = targetCells.get(misplaced.id) as Hex;
    // Se o destino está ocupado, as duas unidades trocam de lugar; a próxima passada ajusta quem ficou fora do lugar.
    const result = game.move(botId, misplaced.id, { kind: 'board', cell });
    if (!result.ok && result.reason === 'board_full') {
      swapWithUnitThatShouldLeaveBoard(game, bot, misplaced, deployedIds);
    }
  }
  stowRemainingUnitsOnBench(game, bot, deployedIds);
}

/** Tabuleiro cheio: a unidade que deve entrar troca de lugar com uma que deve sair. */
function swapWithUnitThatShouldLeaveBoard(game: Game, bot: PlayerState, incoming: OwnedUnit, deployedIds: ReadonlySet<string>): void {
  const outgoing = boardUnitsOf(bot).find((unit) => !deployedIds.has(unit.id));
  if (outgoing) {
    game.move(bot.id, incoming.id, outgoing.location);
  }
}

/** Os mais fortes (mais estrelas, depois mais caros) até o limite da rodada. */
function chooseUnitsToDeploy(game: Game, bot: PlayerState): OwnedUnit[] {
  const strength = (unit: OwnedUnit) => unit.starLevel * 100 + rarityRank(game.getCharacter(unit.characterId).rarity);
  return [...bot.units].sort((first, second) => strength(second) - strength(first) || first.acquiredOrder - second.acquiredOrder).slice(0, game.unitLimit);
}

function rarityRank(rarity: 'common' | 'rare' | 'special'): number {
  return rarity === 'special' ? 2 : rarity === 'rare' ? 1 : 0;
}

function assignCells(game: Game, units: readonly OwnedUnit[]): Map<string, Hex> {
  const frontCells = orderedCells(FRONT_ROWS);
  const backCells = orderedCells(BACK_ROWS);
  const assignments = new Map<string, Hex>();
  const isMelee = (unit: OwnedUnit) => game.getCharacter(unit.characterId).stats.range <= MELEE_MAXIMUM_RANGE;

  for (const unit of units) {
    const preferred = isMelee(unit) ? frontCells : backCells;
    const fallback = isMelee(unit) ? backCells : frontCells;
    const cell = preferred.shift() ?? fallback.shift();
    if (cell) {
      assignments.set(unit.id, cell);
    }
  }
  return assignments;
}

function orderedCells(rows: readonly number[]): Hex[] {
  return rows.flatMap((row) => COLUMNS_FROM_CENTER.map((column) => offsetToAxial({ column, row })));
}

function isAtCell(unit: OwnedUnit, cell: Hex | undefined): boolean {
  return cell !== undefined && unit.location.kind === 'board' && hexesAreEqual(unit.location.cell, cell);
}

function stowRemainingUnitsOnBench(game: Game, bot: PlayerState, deployedIds: ReadonlySet<string>): void {
  for (const unit of bot.units.filter((candidate) => !deployedIds.has(candidate.id) && candidate.location.kind === 'board')) {
    const freeSlot = firstFreeBenchSlot(bot, game.config.rounds.benchSize);
    if (freeSlot !== null) {
      game.move(bot.id, unit.id, { kind: 'bench', slot: freeSlot });
    }
  }
}

function firstFreeBenchSlot(bot: PlayerState, benchSize: number): number | null {
  const usedSlots = benchUnitsOf(bot).map((unit): UnitLocation => unit.location);
  for (let slot = 0; slot < benchSize; slot++) {
    if (!usedSlots.some((location) => location.kind === 'bench' && location.slot === slot)) {
      return slot;
    }
  }
  return null;
}
