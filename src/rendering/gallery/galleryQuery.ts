/** Filtro, ordenação e escolha de quem comparar. Lógica pura. */
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, type AttributeKey, type GalleryEntry } from './galleryModel';

export type SortKey = 'name' | AttributeKey;

export const SORT_OPTIONS: readonly { readonly key: SortKey; readonly label: string }[] = [
  { key: 'name', label: 'Nome (A a Z)' },
  ...ATTRIBUTE_KEYS.map((key) => ({ key, label: `${ATTRIBUTE_LABELS[key]} (maior primeiro)` })),
];

export interface GalleryFilter {
  /** `null` mostra todas as sinergias. */
  readonly synergyId: string | null;
  readonly sortKey: SortKey;
}

export const DEFAULT_FILTER: GalleryFilter = { synergyId: null, sortKey: 'name' };

export function attributeValueOf(entry: GalleryEntry, key: AttributeKey): number {
  return entry.attributes.find((attribute) => attribute.key === key)?.scaleValue ?? 0;
}

function compareNames(first: GalleryEntry, second: GalleryEntry): number {
  return first.name.localeCompare(second.name, 'pt-BR');
}

/** Devolve uma lista nova; por atributo, o maior vem primeiro e o empate segue o nome. */
export function filterAndSortEntries(entries: readonly GalleryEntry[], filter: GalleryFilter): GalleryEntry[] {
  const { synergyId, sortKey } = filter;
  const visible = entries.filter((entry) => synergyId === null || entry.synergy?.id === synergyId);
  if (sortKey === 'name') {
    return visible.sort(compareNames);
  }
  return visible.sort((first, second) => attributeValueOf(second, sortKey) - attributeValueOf(first, sortKey) || compareNames(first, second));
}

export const COMPARISON_SIZE = 2;

/** Tocar de novo desmarca; com dois marcados, um terceiro substitui o mais antigo. */
export function toggleComparisonChoice(chosenIds: readonly string[], id: string): string[] {
  if (chosenIds.includes(id)) {
    return chosenIds.filter((chosenId) => chosenId !== id);
  }
  return [...chosenIds, id].slice(-COMPARISON_SIZE);
}

/** Qual dos dois tem o atributo maior: 0, 1 ou `null` no empate. */
export function strongerSideOf(first: GalleryEntry, second: GalleryEntry, key: AttributeKey): 0 | 1 | null {
  const difference = attributeValueOf(first, key) - attributeValueOf(second, key);
  if (difference === 0) {
    return null;
  }
  return difference > 0 ? 0 : 1;
}
