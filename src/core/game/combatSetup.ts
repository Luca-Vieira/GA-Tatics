import type { CombatConfig } from '@combat/engine/CombatSimulation';
import { unitSpecFromCharacter } from '@combat/units/fromCharacter';
import type { UnitSpec } from '@combat/units/unit';
import type { CharacterDefinition } from '@data/schemas/character';
import { mirrorCell, type BoardSide } from '@shared/constants/board';
import { boardUnitsOf, type OwnedUnit, type PlayerState } from '../players/playerState';
import { combineBonusEffects, summarizeSynergies, synergyEffectsFor, type SynergyMapping } from '../synergies/synergies';
import type { CombatRules } from './roomModifiers';
import { isTowerId } from '../tower/tower';
import { hexDistance, type Hex } from '@shared/utils/hex';
import type { SynergyEffect, SynergyDefinition } from '@data/schemas/synergy';
import type { TowerBuff } from '@data/schemas/gameConfig';

export interface CombatSetupContext {
  readonly charactersById: ReadonlyMap<string, CharacterDefinition>;
  readonly synergies: readonly SynergyDefinition[];
  readonly synergyMapping: SynergyMapping;
  /** Bônus de cada tipo de torre, pelo id. */
  readonly towerBuffsById?: ReadonlyMap<string, readonly TowerBuff[]>;
  /** Regras de combate da sala (bônus de status e limite de tempo). Sem elas, valem as regras normais. */
  readonly rules?: CombatRules;
}

/** Id da unidade no combate: o lado, para nunca repetir entre os dois jogadores, e o id da unidade do jogador. */
export function combatUnitId(side: BoardSide, ownedUnit: OwnedUnit): string {
  return `${side}-${ownedUnit.id}`;
}

/** Efeitos das torres do tabuleiro que alcançam uma casa (medidos no referencial do próprio jogador). */
function towerEffectsReaching(cell: Hex, boardUnits: readonly OwnedUnit[], context: CombatSetupContext): SynergyEffect[] {
  return boardUnits.flatMap((tower) => {
    if (!isTowerId(tower.characterId) || tower.location.kind !== 'board') {
      return [];
    }
    const towerCell = tower.location.cell;
    const buffs = context.towerBuffsById?.get(tower.characterId) ?? [];
    return buffs.filter((buff) => buff.radius === undefined || hexDistance(towerCell, cell) <= buff.radius).map((buff) => buff.effect);
  });
}

/**
 * Unidades que o jogador leva ao combate. As casas do jogador ficam no referencial do lado A; quem luta como lado B
 * tem as casas espelhadas (rotação de 180°), ficando na metade de baixo. Os bônus de sinergia e de torre são calculados
 * aqui, uma única vez, a partir do que está no tabuleiro no momento em que o combate começa.
 */
export function buildSideUnits(player: PlayerState, side: BoardSide, context: CombatSetupContext): UnitSpec[] {
  const boardUnits = boardUnitsOf(player);
  const synergyStatuses = summarizeSynergies(
    boardUnits.map((unit) => unit.characterId),
    context.synergyMapping,
    context.synergies,
  );

  const statMultiplier = context.rules?.statMultiplier ?? 1;
  const withStatBonus = (spec: UnitSpec): UnitSpec =>
    statMultiplier === 1 ? spec : { ...spec, stats: { ...spec.stats, health: spec.stats.health * statMultiplier, damage: spec.stats.damage * statMultiplier } };

  return boardUnits.map((ownedUnit) => {
    const character = context.charactersById.get(ownedUnit.characterId);
    if (!character || ownedUnit.location.kind !== 'board') {
      throw new Error(`Unidade inválida no tabuleiro: ${ownedUnit.id}`);
    }
    const cell = side === 'A' ? ownedUnit.location.cell : mirrorCell(ownedUnit.location.cell);
    if (isTowerId(ownedUnit.characterId)) {
      return withStatBonus({ id: combatUnitId(side, ownedUnit), name: character.name, side, cell, stats: character.stats, characterId: character.id, isStructure: true });
    }
    const bonuses = combineBonusEffects([
      ...synergyEffectsFor(synergyStatuses, context.synergyMapping[ownedUnit.characterId]),
      ...towerEffectsReaching(ownedUnit.location.cell, boardUnits, context),
    ]);
    return withStatBonus(unitSpecFromCharacter(character, { id: combatUnitId(side, ownedUnit), side, cell, starLevel: ownedUnit.starLevel, bonuses }));
  });
}

/** Configuração do combate entre dois jogadores: `top` fica na metade de cima (lado A) e `bottom` na de baixo (lado B). */
export function buildCombatConfig(top: PlayerState, bottom: PlayerState, seed: string, context: CombatSetupContext): CombatConfig {
  const units = [...buildSideUnits(top, 'A', context), ...buildSideUnits(bottom, 'B', context)];
  return context.rules ? { seed, units, timeLimitMs: context.rules.timeLimitMs } : { seed, units };
}
