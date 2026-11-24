import type { CharacterDefinition } from '@data/schemas/character';
import { cellsOfSide, type BoardSide } from '@shared/constants/board';
import { SeededRandom } from '@shared/utils/random';
import type { TeamBonuses } from './bonuses';
import { unitSpecFromCharacter } from './fromCharacter';
import type { UnitSpec } from './unit';

const SIDES: readonly BoardSide[] = ['A', 'B'];

/** Bônus de equipe por lado; o lado ausente luta sem bônus. */
export type BonusesBySide = Partial<Record<BoardSide, TeamBonuses>>;

/**
 * Cenário aleatório (reproduzível pela semente): cada lado recebe `unitsPerSide` personagens do elenco em casas sorteadas.
 * `bonusesBySide` simula um nível de sinergia ativo em um dos lados, sem mudar o sorteio.
 */
export function createRosterScenario(seed: number | string, roster: readonly CharacterDefinition[], unitsPerSide = 4, bonusesBySide: BonusesBySide = {}): UnitSpec[] {
  const random = new SeededRandom(seed);
  return SIDES.flatMap((side) =>
    random
      .shuffled(cellsOfSide(side))
      .slice(0, unitsPerSide)
      .map((cell, position) => unitSpecFromCharacter(random.pick(roster), { id: `${side}${position + 1}`, side, cell, bonuses: bonusesBySide[side] })),
  );
}
