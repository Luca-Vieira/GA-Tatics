/** As três telas da galeria: lista, detalhe e comparação lado a lado. */
import {
  createAttackMap,
  createAttributeBars,
  createButton,
  createContainer,
  createElement,
  createPortrait,
  type SpriteUrlResolver,
} from './galleryElements';
import { ATTRIBUTE_KEYS, type GalleryEntry } from './galleryModel';
import { strongerSideOf } from './galleryQuery';

export interface ViewContext {
  readonly spriteUrlOf: SpriteUrlResolver;
  readonly comparisonIds: readonly string[];
  readonly openDetail: (id: string) => void;
  readonly toggleComparison: (id: string) => void;
}

function createEntryPortrait(entry: GalleryEntry, context: ViewContext): HTMLElement {
  return createPortrait({ name: entry.name, sprite: entry.sprite, ringColor: entry.synergy?.color ?? null, spriteUrlOf: context.spriteUrlOf });
}

function createTag(text: string, color: string): HTMLElement {
  const tag = createElement('span', 'galeria-etiqueta', text);
  tag.style.borderColor = color;
  return tag;
}

function createCompareButton(entry: GalleryEntry, context: ViewContext): HTMLButtonElement {
  const isChosen = context.comparisonIds.includes(entry.id);
  const button = createButton(isChosen ? '✓ Comparando' : 'Comparar', () => context.toggleComparison(entry.id));
  button.setAttribute('aria-pressed', String(isChosen));
  return button;
}

export function createCard(entry: GalleryEntry, context: ViewContext, canCompare = true): HTMLElement {
  const openButton = createButton('', () => context.openDetail(entry.id), 'galeria-abrir');
  openButton.setAttribute('aria-label', `Ver detalhes de ${entry.name}`);
  openButton.append(
    createEntryPortrait(entry, context),
    createElement('span', 'galeria-nome', `${entry.ability.icon} ${entry.name}`.trim()),
    createElement('span', 'galeria-apagado', `${entry.archetype} · ${entry.rarityLabel}`),
  );
  if (entry.synergy) {
    openButton.append(createTag(entry.synergy.name, entry.synergy.color));
  }
  if (entry.attack) {
    openButton.append(createElement('span', 'galeria-apagado', `${entry.attack.shapeLabel} · alcance ${entry.attack.range}`));
  }
  const card = createContainer('galeria-cartao', openButton, createAttributeBars(entry.attributes));
  card.style.borderTopColor = entry.rarityColor;
  if (canCompare) {
    card.append(createCompareButton(entry, context));
  }
  return card;
}

function createBlock(title: string, ...children: Node[]): HTMLElement {
  return createContainer('galeria-bloco', createElement('h3', '', title), ...children);
}

function createIdentityBlock(entry: GalleryEntry, context: ViewContext): HTMLElement {
  const names = createContainer(
    '',
    createElement('h3', '', entry.name),
    createElement('p', 'galeria-apagado', `${entry.archetype} · ${entry.rarityLabel}`),
  );
  const block = createContainer('galeria-bloco', createContainer('galeria-cabecalho', createEntryPortrait(entry, context), names), createElement('p', '', entry.description));
  if (entry.synergy) {
    block.append(
      createTag(`Sinergia vigente: ${entry.synergy.name}`, entry.synergy.color),
      createElement('p', 'galeria-apagado', entry.synergy.description),
      ...entry.synergy.tierLines.map((line) => createElement('p', 'galeria-apagado', line)),
    );
  }
  return block;
}

function createAbilityBlock(entry: GalleryEntry, context: ViewContext): HTMLElement {
  const { ability } = entry;
  const block = createBlock(
    `Habilidade: ${`${ability.icon} ${ability.name}`.trim()}`,
    createElement('p', 'galeria-apagado', ability.timing),
    createElement('p', '', ability.description),
  );
  if (ability.projectileIcon !== '') {
    block.append(createElement('p', 'galeria-apagado', `Projétil: ${ability.projectileIcon}`));
  }
  for (const summon of entry.summons) {
    const portrait = createPortrait({ name: summon.name, sprite: summon.sprite, ringColor: entry.synergy?.color ?? null, spriteUrlOf: context.spriteUrlOf, isSmall: true });
    block.append(createContainer('galeria-cabecalho', portrait, createElement('span', '', `Invoca: ${summon.name}`)));
  }
  return block;
}

function createAttackBlock(entry: GalleryEntry): HTMLElement {
  if (!entry.attack) {
    return createBlock('Área de ação', createElement('p', '', 'Não ataca nem se move.'));
  }
  return createBlock(
    `Área de ação: ${entry.attack.shapeLabel}`,
    createAttackMap(entry.name, entry.attack),
    createElement('p', '', entry.attack.description),
    createElement('p', 'galeria-apagado', 'Azul: o personagem, olhando para a direita. Laranja: casas que o ataque alcança. Ele se vira para o alvo.'),
  );
}

function createTraitRows(entry: GalleryEntry): HTMLElement[] {
  return entry.traits.map((trait) => createContainer('galeria-caracteristica', createElement('span', 'galeria-apagado', trait.label), createElement('span', '', trait.value)));
}

export function createDetailView(entry: GalleryEntry, context: ViewContext, canCompare: boolean): HTMLElement {
  const identity = createIdentityBlock(entry, context);
  if (canCompare) {
    identity.append(createCompareButton(entry, context));
  }
  return createContainer(
    'galeria-detalhe',
    identity,
    createBlock('Atributos (1 estrela, sem bônus)', createAttributeBars(entry.attributes), ...createTraitRows(entry)),
    createAttackBlock(entry),
    createAbilityBlock(entry, context),
  );
}

function createComparisonColumn(entry: GalleryEntry, context: ViewContext, strongerKeys: ReadonlySet<string>): HTMLElement {
  const attackParts: Node[] = entry.attack ? [createAttackMap(entry.name, entry.attack), createElement('p', 'galeria-apagado', entry.attack.description)] : [];
  return createContainer(
    'galeria-bloco',
    createContainer('galeria-cabecalho', createEntryPortrait(entry, context), createElement('h3', '', entry.name)),
    createElement('p', 'galeria-apagado', `${entry.archetype} · ${entry.rarityLabel} · ${entry.synergy?.name ?? 'sem sinergia'}`),
    createAttributeBars(entry.attributes, strongerKeys),
    ...attackParts,
    ...createTraitRows(entry),
    createElement('p', '', `${`${entry.ability.icon} ${entry.ability.name}`.trim()} (${entry.ability.timing})`),
    createElement('p', 'galeria-apagado', entry.ability.description),
    createButton('Ver detalhes', () => context.openDetail(entry.id)),
  );
}

export function createComparisonView(first: GalleryEntry, second: GalleryEntry, context: ViewContext): HTMLElement {
  const entries = [first, second] as const;
  const columns = entries.map((entry, side) => {
    const strongerKeys = new Set<string>(ATTRIBUTE_KEYS.filter((key) => strongerSideOf(first, second, key) === side));
    return createComparisonColumn(entry, context, strongerKeys);
  });
  return createContainer('galeria-comparacao', ...columns);
}
