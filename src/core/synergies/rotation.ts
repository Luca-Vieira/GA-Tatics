import { MINIMUM_CHARACTERS_PER_SYNERGY, type SynergyRotationConfig } from '@data/schemas/synergy';
import { SeededRandom } from '@shared/utils/random';
import type { SynergyMapping } from './synergies';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
/** Com exatamente 3 sinergias vale o sorteio original (sem rejeição); com outra quantidade, o sorteio geral. */
const CLASSIC_SYNERGY_COUNT = 3;
const MINIMUM_ROTATING_SYNERGIES = 2;

function intervalMs(config: SynergyRotationConfig): number {
  return config.intervalDays * MILLISECONDS_PER_DAY;
}

/** Índice da rotação vigente: floor((agora − âncora) / intervalo); antes da âncora vale 0. */
export function rotationIndexAt(nowMs: number, config: SynergyRotationConfig): number {
  const elapsedMs = nowMs - Date.parse(config.anchor);
  return Math.max(0, Math.floor(elapsedMs / intervalMs(config)));
}

/** Instante (ms UTC) em que a rotação `index` começa. */
export function rotationStartMs(index: number, config: SynergyRotationConfig): number {
  return Date.parse(config.anchor) + index * intervalMs(config);
}

/** Tempo, em ms, até a próxima redistribuição. */
export function millisecondsUntilNextRotation(nowMs: number, config: SynergyRotationConfig): number {
  return rotationStartMs(rotationIndexAt(nowMs, config) + 1, config) - nowMs;
}

/**
 * Distribuição da rotação `index`. O índice 0 é a distribuição de lançamento; cada rotação seguinte nasce da anterior
 * por sorteio determinístico, então basta o índice (e a configuração) para qualquer cliente chegar ao mesmo mapa.
 * Um override administrativo, se existir, substitui o sorteio.
 */
export function synergyMappingForIndex(index: number, config: SynergyRotationConfig, initialMapping: SynergyMapping, synergyIds: readonly string[]): SynergyMapping {
  if (config.override) {
    return config.override;
  }
  let mapping = initialMapping;
  for (let rotation = 1; rotation <= index; rotation++) {
    mapping = drawNextMapping(mapping, rotation, config, synergyIds);
  }
  return mapping;
}

/** Personagens cuja sinergia mudou entre dois mapas (para o selo de "atualizado" na interface). */
export function charactersWithChangedSynergy(previous: SynergyMapping, current: SynergyMapping): string[] {
  return Object.keys(current).filter((characterId) => previous[characterId] !== current[characterId]);
}

/** Tentativas de sorteio antes de usar a divisão ao meio (que sempre serve quando cada sinergia tem o mínimo). */
const MAXIMUM_DRAW_ATTEMPTS = 200;

/**
 * Sorteio da rotação (decisoes-de-design.md, Seção 7). Com 3 sinergias e a regra "ninguém repete", cada personagem vai
 * para uma das duas outras sinergias: cada sinergia envia `x` personagens para a seguinte e o resto para a outra.
 *
 * - **Sinergias do mesmo tamanho:** sorteio direto, sem rejeição, com o mesmo `x` em todas (x de 0 a N), o que mantém os
 *   tamanhos iguais para sempre (comportamento original, preservado).
 * - **Tamanhos diferentes** (ex.: 5, 4 e 4): sorteia-se um `x` por sinergia e descarta-se a combinação que deixaria alguma
 *   sinergia com menos que o mínimo de personagens. O sorteio é determinístico (semente + rodada), e se nenhuma
 *   combinação servir em `MAXIMUM_DRAW_ATTEMPTS` tentativas, cada sinergia envia metade dos seus personagens (sempre válido).
 * Depois sorteia-se, em cada grupo, quais personagens vão para onde.
 */
function drawNextMapping(previous: SynergyMapping, rotation: number, config: SynergyRotationConfig, synergyIds: readonly string[]): SynergyMapping {
  if (synergyIds.length < MINIMUM_ROTATING_SYNERGIES) {
    throw new Error(`A rotação precisa de ao menos ${MINIMUM_ROTATING_SYNERGIES} sinergias.`);
  }
  const random = new SeededRandom(`${config.seedPrefix}${rotation}`);
  const membersBySynergy = synergyIds.map((synergyId) => Object.keys(previous).filter((characterId) => previous[characterId] === synergyId).sort());
  if (synergyIds.length !== CLASSIC_SYNERGY_COUNT) {
    return drawGeneralMapping(synergyIds, membersBySynergy, random);
  }
  const sendToNextByGroup = drawSendCounts(membersBySynergy.map((members) => members.length), random);

  const next: Record<string, string> = {};
  membersBySynergy.forEach((members, groupIndex) => {
    const nextSynergyId = synergyIds[(groupIndex + 1) % CLASSIC_SYNERGY_COUNT] as string;
    const otherSynergyId = synergyIds[(groupIndex + 2) % CLASSIC_SYNERGY_COUNT] as string;
    const sendToNext = sendToNextByGroup[groupIndex] as number;
    random.shuffled(members).forEach((characterId, position) => {
      next[characterId] = position < sendToNext ? nextSynergyId : otherSynergyId;
    });
  });
  return next;
}

/** Quantos personagens cada sinergia envia para a seguinte (o resto vai para a outra). */
function drawSendCounts(sizes: readonly number[], random: SeededRandom): number[] {
  const areAllSizesEqual = sizes.every((size) => size === sizes[0]);
  if (areAllSizesEqual) {
    const sendToNext = random.integerBetween(0, sizes[0] ?? 0);
    return sizes.map(() => sendToNext);
  }
  for (let attempt = 0; attempt < MAXIMUM_DRAW_ATTEMPTS; attempt++) {
    const candidate = sizes.map((size) => random.integerBetween(0, size));
    if (everySynergyKeepsTheMinimum(sizes, candidate)) {
      return candidate;
    }
  }
  return sizes.map((size) => Math.floor(size / 2));
}

/** Tamanho de cada sinergia depois da troca: o que a anterior enviou à seguinte, mais o que a seguinte enviou "à outra". */
function everySynergyKeepsTheMinimum(sizes: readonly number[], sendToNext: readonly number[]): boolean {
  return sizes.every((_, index) => {
    const previousGroup = (index + CLASSIC_SYNERGY_COUNT - 1) % CLASSIC_SYNERGY_COUNT;
    const nextGroup = (index + 1) % CLASSIC_SYNERGY_COUNT;
    const newSize = (sendToNext[previousGroup] as number) + (sizes[nextGroup] as number) - (sendToNext[nextGroup] as number);
    return newSize >= MINIMUM_CHARACTERS_PER_SYNERGY;
  });
}

/** Tentativas do sorteio geral; cada uma é uma distribuição inteira, então um número alto é barato. */
const MAXIMUM_GENERAL_DRAW_ATTEMPTS = 1000;

/**
 * Sorteio para qualquer quantidade de sinergias (diferente de 3): cada personagem vai para uma das outras sinergias,
 * sorteada com a semente da rotação; descarta-se a distribuição que deixaria alguma sinergia abaixo do mínimo.
 * Se nenhuma servir, usa-se uma divisão cíclica (o k-ésimo personagem de cada grupo, já embaralhado, vai para a
 * (k mod (N − 1))-ésima sinergia seguinte), que reparte o grupo por igual entre as outras sinergias.
 */
function drawGeneralMapping(synergyIds: readonly string[], membersBySynergy: readonly (readonly string[])[], random: SeededRandom): SynergyMapping {
  const count = synergyIds.length;
  const placements = membersBySynergy.flatMap((members, group) => members.map((characterId) => ({ characterId, group })));

  for (let attempt = 0; attempt < MAXIMUM_GENERAL_DRAW_ATTEMPTS; attempt++) {
    const destinations = placements.map((placement) => (placement.group + 1 + random.integerBetween(0, count - 2)) % count);
    const newSizes = new Array<number>(count).fill(0);
    destinations.forEach((destination) => {
      newSizes[destination] = (newSizes[destination] as number) + 1;
    });
    if (newSizes.every((size) => size >= MINIMUM_CHARACTERS_PER_SYNERGY)) {
      const mapping: Record<string, string> = {};
      placements.forEach((placement, position) => {
        mapping[placement.characterId] = synergyIds[destinations[position] as number] as string;
      });
      return mapping;
    }
  }

  const mapping: Record<string, string> = {};
  membersBySynergy.forEach((members, group) => {
    random.shuffled(members).forEach((characterId, position) => {
      mapping[characterId] = synergyIds[(group + 1 + (position % (count - 1))) % count] as string;
    });
  });
  return mapping;
}

