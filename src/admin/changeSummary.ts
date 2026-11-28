/** Rascunho da nota de atualização: compara o conteúdo publicado com o que vai ser publicado. Lógica pura. */
import type { CharacterDefinition } from '@data/schemas/character';
import type { GameContent } from '@data/schemas/content';

interface Named {
  readonly id: string;
  readonly name: string;
  readonly active?: boolean;
}

const STAT_LABELS: Readonly<Record<keyof CharacterDefinition['stats'], string>> = {
  health: 'vida',
  damage: 'dano',
  attackSpeed: 'velocidade de ataque',
  range: 'alcance',
  mobility: 'mobilidade',
};

const RARITY_LABELS: Readonly<Record<CharacterDefinition['rarity'], string>> = { common: 'comum', rare: 'raro', special: 'especial' };

const isSame = (first: unknown, second: unknown): boolean => JSON.stringify(first) === JSON.stringify(second);

/** O que mudou num personagem, em poucas palavras. O sprite não entra: não é assunto de nota. */
function characterChanges(before: CharacterDefinition, after: CharacterDefinition): string[] {
  const changes: string[] = [];
  for (const key of Object.keys(STAT_LABELS) as (keyof CharacterDefinition['stats'])[]) {
    if (before.stats[key] !== after.stats[key]) {
      changes.push(`${STAT_LABELS[key]} ${before.stats[key]} → ${after.stats[key]}`);
    }
  }
  if (before.rarity !== after.rarity) {
    changes.push(`raridade ${RARITY_LABELS[before.rarity]} → ${RARITY_LABELS[after.rarity]}`);
  }
  if (!isSame(before.ability, after.ability)) {
    changes.push('habilidade ajustada');
  }
  if (!isSame(before.attack, after.attack)) {
    changes.push('ataque ajustado');
  }
  if (!isSame(before.behavior, after.behavior)) {
    changes.push('comportamento ajustado');
  }
  return changes;
}

/** Novidades, saídas e mudanças de uma lista de coisas com id (personagens, sinergias, torres, mapas). */
function listChanges<Item extends Named>(label: string, before: readonly Item[], after: readonly Item[], describe: (previous: Item, next: Item) => string[]): string[] {
  const previousById = new Map(before.map((item) => [item.id, item]));
  const lines: string[] = [];
  for (const item of after) {
    const previous = previousById.get(item.id);
    const isReleased = item.active !== false;
    const wasReleased = previous !== undefined && previous.active !== false;
    if (!isReleased) {
      if (wasReleased) {
        lines.push(`${label} fora do jogo: ${item.name}.`);
      }
      continue;
    }
    if (!wasReleased) {
      lines.push(`${label} no jogo: ${item.name}.`);
      continue;
    }
    const details = describe(previous, item);
    if (details.length > 0) {
      lines.push(`${item.name}: ${details.join(', ')}.`);
    }
  }
  const remainingIds = new Set(after.map((item) => item.id));
  lines.push(...before.filter((item) => item.active !== false && !remainingIds.has(item.id)).map((item) => `${label} fora do jogo: ${item.name}.`));
  return lines;
}

const adjustedUnlessSame =
  (description: string) =>
  <Item>(previous: Item, next: Item): string[] =>
    isSame(previous, next) ? [] : [description];

/** Uma linha por mudança que os jogadores percebem; lista vazia quando só mudou o que não se vê (como sprites). */
export function summarizeContentChanges(published: GameContent, next: GameContent): string[] {
  const { tower: previousTower, ...previousConfig } = published.config;
  const { tower: nextTower, ...nextConfig } = next.config;
  const { variants: previousVariants, ...previousBasicTower } = previousTower;
  const { variants: nextVariants, ...nextBasicTower } = nextTower;
  return [
    ...listChanges('Personagem', published.characters, next.characters, characterChanges),
    ...listChanges('Sinergia', published.synergies, next.synergies, adjustedUnlessSame('bônus ou textos ajustados')),
    ...(isSame(previousBasicTower, nextBasicTower) ? [] : ['Torre básica ou regras das torres ajustadas.']),
    ...listChanges('Torre', previousVariants, nextVariants, adjustedUnlessSame('ajustada')),
    ...listChanges('Mapa', published.maps, next.maps, adjustedUnlessSame('visual novo')),
    ...(isSame(previousConfig, nextConfig) ? [] : ['Regras de economia, loja ou rodadas ajustadas.']),
    ...(isSame([published.rotation, published.initialSynergyMapping], [next.rotation, next.initialSynergyMapping]) ? [] : ['Distribuição ou rotação das sinergias alterada.']),
  ];
}
