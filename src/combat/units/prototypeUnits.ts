import { cellsOfSide, type BoardSide } from '@shared/constants/board';
import { SeededRandom } from '@shared/utils/random';
import type { BaseStats } from './stats';
import type { UnitSpec } from './unit';

/** Os dois personagens genéricos do protótipo (Etapa 1). Serão substituídos pelos 12 personagens na Etapa 2. */
export const PROTOTYPE_FIGHTER: { readonly name: string; readonly stats: BaseStats } = {
  name: 'Lutador',
  stats: { health: 7, damage: 6, attackSpeed: 5, range: 1, mobility: 5 },
};

export const PROTOTYPE_ARCHER: { readonly name: string; readonly stats: BaseStats } = {
  name: 'Arqueiro',
  stats: { health: 4, damage: 5, attackSpeed: 6, range: 4, mobility: 4 },
};

const PROTOTYPE_TYPES = [PROTOTYPE_FIGHTER, PROTOTYPE_ARCHER] as const;
const SIDES: readonly BoardSide[] = ['A', 'B'];

/** Cenário aleatório (mas reproduzível pela semente): cada lado recebe `unitsPerSide` unidades em casas sorteadas. */
export function createPrototypeScenario(seed: number | string, unitsPerSide = 4): UnitSpec[] {
  const random = new SeededRandom(seed);
  return SIDES.flatMap((side) =>
    random
      .shuffled(cellsOfSide(side))
      .slice(0, unitsPerSide)
      .map((cell, position) => {
        const type = random.pick(PROTOTYPE_TYPES);
        return { id: `${side}${position + 1}`, name: type.name, side, cell, stats: type.stats };
      }),
  );
}
