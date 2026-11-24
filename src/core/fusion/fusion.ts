import type { StarLevel } from '@combat/units/stats';
import type { OwnedUnit, PlayerState } from '../players/playerState';
import { isTowerId } from '../tower/tower';

/** Quantas cópias iguais, do mesmo nível, formam a unidade de nível seguinte. */
export const COPIES_PER_FUSION = 3;
export const MAXIMUM_STAR_LEVEL: StarLevel = 3;

export interface FusionResult {
  readonly characterId: string;
  readonly resultStarLevel: StarLevel;
  readonly resultUnitId: string;
  readonly consumedUnitIds: readonly string[];
}

/** Quantas cópias de 1 estrela do personagem o jogador já tem (a próxima compra completa a fusão com 2). */
export function countCopies(player: PlayerState, characterId: string, starLevel: StarLevel): number {
  return player.units.filter((unit) => unit.characterId === characterId && unit.starLevel === starLevel).length;
}

export function wouldCompleteFusion(player: PlayerState, characterId: string): boolean {
  return !isTowerId(characterId) && countCopies(player, characterId, 1) === COPIES_PER_FUSION - 1;
}

/**
 * Funde automaticamente todos os grupos de três unidades iguais, repetindo até nada mais se combinar
 * (uma fusão pode completar outra). A unidade resultante ocupa o lugar da "primeira" do grupo:
 * as do tabuleiro vêm antes das da reserva e, dentro de cada uma, as mais antigas primeiro.
 */
export function fuseAll(player: PlayerState): FusionResult[] {
  const results: FusionResult[] = [];
  let group = findFusionGroup(player.units);
  while (group) {
    results.push(fuseGroup(player, group));
    group = findFusionGroup(player.units);
  }
  return results;
}

function findFusionGroup(units: readonly OwnedUnit[]): OwnedUnit[] | null {
  const orderedUnits = [...units].sort((first, second) => first.characterId.localeCompare(second.characterId) || first.starLevel - second.starLevel);
  const groups = new Map<string, OwnedUnit[]>();
  for (const unit of orderedUnits) {
    if (unit.starLevel >= MAXIMUM_STAR_LEVEL || isTowerId(unit.characterId)) {
      continue;
    }
    const key = `${unit.characterId}|${unit.starLevel}`;
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  }
  for (const members of groups.values()) {
    if (members.length >= COPIES_PER_FUSION) {
      return [...members].sort(compareFusionPriority).slice(0, COPIES_PER_FUSION);
    }
  }
  return null;
}

function compareFusionPriority(first: OwnedUnit, second: OwnedUnit): number {
  const firstRank = first.location.kind === 'board' ? 0 : 1;
  const secondRank = second.location.kind === 'board' ? 0 : 1;
  return firstRank - secondRank || first.acquiredOrder - second.acquiredOrder;
}

function fuseGroup(player: PlayerState, group: readonly OwnedUnit[]): FusionResult {
  const [firstUnit] = group as [OwnedUnit, ...OwnedUnit[]];
  const resultStarLevel = (firstUnit.starLevel + 1) as StarLevel;
  const serial = ++player.unitSerial;
  const resultUnit: OwnedUnit = {
    id: `${player.id}-u${serial}`,
    characterId: firstUnit.characterId,
    starLevel: resultStarLevel,
    acquiredOrder: serial,
    location: firstUnit.location,
  };
  const consumedIds = new Set(group.map((unit) => unit.id));
  player.units = [...player.units.filter((unit) => !consumedIds.has(unit.id)), resultUnit];
  return { characterId: resultUnit.characterId, resultStarLevel, resultUnitId: resultUnit.id, consumedUnitIds: [...consumedIds] };
}
