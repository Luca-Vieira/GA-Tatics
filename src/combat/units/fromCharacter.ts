import type { CharacterDefinition } from '@data/schemas/character';
import type { BoardSide } from '@shared/constants/board';
import type { Hex } from '@shared/utils/hex';
import type { TeamBonuses } from './bonuses';
import type { StarLevel, StarMultipliers } from './stats';
import type { UnitSpec } from './unit';
import { STAR_MULTIPLIERS } from './stats';

export interface Placement {
  readonly id: string;
  readonly side: BoardSide;
  readonly cell: Hex;
  readonly starLevel?: StarLevel;
  readonly bonuses?: TeamBonuses;
}

/** Monta a unidade de combate a partir de uma definição do elenco. */
export function unitSpecFromCharacter(character: CharacterDefinition, placement: Placement): UnitSpec {
  const customMultipliers = character.evolution.starMultipliers;
  const starMultipliers: StarMultipliers | undefined = customMultipliers ? { ...STAR_MULTIPLIERS, 2: customMultipliers[2], 3: customMultipliers[3] } : undefined;
  return {
    id: placement.id,
    name: character.name,
    side: placement.side,
    cell: placement.cell,
    stats: character.stats,
    starLevel: placement.starLevel,
    starMultipliers,
    behavior: character.behavior,
    ability: character.ability,
    attack: character.attack,
    characterId: character.id,
    bonuses: placement.bonuses,
  };
}
