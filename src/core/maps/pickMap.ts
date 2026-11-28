import { DEFAULT_MAPS } from '@data/defaults/maps';
import type { MapDefinition } from '@data/schemas/map';
import { SeededRandom } from '@shared/utils/random';

/**
 * O mapa da partida: o escolhido pelo anfitrião, se estiver liberado; senão (ou sem escolha), um sorteado entre os
 * liberados. O sorteio sai da semente da partida e não gasta os sorteios do jogo.
 */
export function pickMap(maps: readonly MapDefinition[], chosenId: string | null | undefined, seed: string): MapDefinition {
  const released = maps.filter((map) => map.active);
  const candidates = released.length > 0 ? released : DEFAULT_MAPS;
  return candidates.find((map) => map.id === chosenId) ?? new SeededRandom(`${seed}:map`).pick(candidates);
}
