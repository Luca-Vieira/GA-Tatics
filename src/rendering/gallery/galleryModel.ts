/** Os dados que a galeria mostra, já em texto. Lógica pura: não usa DOM nem Phaser. */
import type { SynergyMapping } from '@core/synergies/synergies';
import { describeSynergyEffect } from '@core/synergies/describe';
import { buildTowerCharacter } from '@core/tower/tower';
import { toCombatStats } from '@combat/units/stats';
import { auxiliarySpriteKeyOf, TOWER_SPRITE_KEY } from '@data/auxiliarySprites';
import { attackOf } from '@data/schemas/attack';
import type { BehaviorProfile, CharacterDefinition, SpriteDefinition } from '@data/schemas/character';
import type { GameContent } from '@data/schemas/content';
import type { SynergyDefinition } from '@data/schemas/synergy';
import { attackShapeLabel, describeAttackArea, type AttackShape } from '@shared/utils/attackArea';
import { RARITY_COLORS, RARITY_LABELS, colorToCss } from '../ui/palette';

export type GalleryContent = Pick<GameContent, 'characters' | 'synergies' | 'initialSynergyMapping' | 'config' | 'auxiliarySprites'>;

export const ATTRIBUTE_KEYS = ['health', 'damage', 'attackSpeed', 'range', 'mobility'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export const ATTRIBUTE_LABELS: Readonly<Record<AttributeKey, string>> = {
  health: 'Vida',
  damage: 'Dano',
  attackSpeed: 'Velocidade de ataque',
  range: 'Alcance',
  mobility: 'Mobilidade',
};

/** Todos os atributos vão de 1 a 10, então as barras de qualquer personagem se comparam. */
export const ATTRIBUTE_SCALE_MAXIMUM = 10;

export interface GalleryAttribute {
  readonly key: AttributeKey;
  readonly label: string;
  /** Valor na escala de 1 a 10 (o tamanho da barra). */
  readonly scaleValue: number;
  /** Valor de jogo, com 1 estrela e sem bônus. */
  readonly displayValue: string;
}

export interface GalleryTrait {
  readonly label: string;
  readonly value: string;
}

export interface GallerySynergy {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly description: string;
  readonly tierLines: readonly string[];
}

export interface GalleryAttack {
  readonly shape: AttackShape;
  readonly shapeLabel: string;
  readonly range: number;
  readonly description: string;
}

export interface GallerySummon {
  readonly name: string;
  readonly sprite: SpriteDefinition | null;
}

export interface GalleryAbility {
  readonly name: string;
  readonly description: string;
  readonly timing: string;
  readonly icon: string;
  readonly projectileIcon: string;
  readonly color: string;
}

export interface GalleryEntry {
  readonly id: string;
  readonly name: string;
  readonly archetype: string;
  readonly description: string;
  readonly rarityLabel: string;
  readonly rarityColor: string;
  readonly synergy: GallerySynergy | null;
  readonly ability: GalleryAbility;
  /** `null` para a torre, que não ataca. */
  readonly attack: GalleryAttack | null;
  readonly attributes: readonly GalleryAttribute[];
  readonly traits: readonly GalleryTrait[];
  readonly summons: readonly GallerySummon[];
  readonly sprite: SpriteDefinition | null;
}

export interface GalleryModel {
  /** Personagens ativos, na ordem do conteúdo. */
  readonly characters: readonly GalleryEntry[];
  /** A torre fica à parte: não é personagem, não tem sinergia e não ataca. */
  readonly tower: GalleryEntry;
  readonly synergies: readonly GallerySynergy[];
}

const TARGET_PRIORITY_LABELS: Readonly<Record<BehaviorProfile['targetPriority'], string>> = {
  nearest: 'Inimigo mais próximo',
  farthest: 'Inimigo mais distante',
  lowest_health: 'Inimigo próximo com menos vida',
  cluster: 'Inimigo próximo no maior grupo',
};

const MOVEMENT_LABELS: Readonly<Record<BehaviorProfile['movement'], string>> = {
  chase: 'Persegue o alvo',
  frontline: 'Avança até a linha de frente',
  kite: 'Mantém distância',
};

const REQUIREMENT_SUFFIXES = {
  always: '',
  ally_wounded: ', quando há aliado ferido por perto',
  ally_fallen: ', depois que um aliado cai',
} as const;

export function abilityTimingText(ability: CharacterDefinition['ability']): string {
  const { activation, cooldownSeconds } = ability;
  switch (activation.type) {
    case 'passive':
      return 'Passiva';
    case 'first_hit_on_target':
      return 'No primeiro golpe em cada novo alvo';
    case 'health_threshold':
      return `Uma vez, com menos de ${Math.round(activation.belowFraction * 100)}% da vida`;
    case 'cooldown':
      return `Recarga de ${formatNumber(cooldownSeconds)} s${REQUIREMENT_SUFFIXES[activation.requires]}`;
  }
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

function toGallerySynergy(synergy: SynergyDefinition): GallerySynergy {
  return {
    id: synergy.id,
    name: synergy.name,
    color: synergy.color,
    description: synergy.description,
    tierLines: synergy.tiers.map((tier) => `Com ${tier.threshold}: ${tier.effects.map(describeSynergyEffect).join(', ')}`),
  };
}

function attributesOf(character: CharacterDefinition): GalleryAttribute[] {
  const stats = toCombatStats(character.stats);
  const displayValues: Record<AttributeKey, string> = {
    health: String(Math.round(stats.maxHealth)),
    damage: String(Math.round(stats.damage)),
    attackSpeed: `${formatNumber(stats.attacksPerSecond)}/s`,
    range: `${stats.range} ${stats.range === 1 ? 'casa' : 'casas'}`,
    mobility: `${formatNumber(stats.hexesPerSecond)} casas/s`,
  };
  return ATTRIBUTE_KEYS.map((key) => ({ key, label: ATTRIBUTE_LABELS[key], scaleValue: character.stats[key], displayValue: displayValues[key] }));
}

function attackModelOf(character: CharacterDefinition): GalleryAttack {
  const attack = attackOf(character);
  const range = character.stats.range;
  return {
    shape: attack.shape,
    shapeLabel: attackShapeLabel(attack.shape),
    range,
    description: describeAttackArea(attack.shape, range, attack.maxTargets, attack.splashDamageFraction),
  };
}

function abilityModelOf(character: CharacterDefinition): GalleryAbility {
  const { ability } = character;
  return {
    name: ability.name,
    description: ability.description,
    timing: abilityTimingText(ability),
    icon: ability.visual.icon ?? '',
    projectileIcon: ability.visual.projectileIcon ?? '',
    color: ability.visual.color,
  };
}

function summonsOf(character: CharacterDefinition, content: GalleryContent): GallerySummon[] {
  return character.ability.effects.flatMap((effect) => {
    const name = effect.type === 'summon' || effect.type === 'place_trap' ? effect.summon.name : effect.type === 'summon_decoy' ? effect.name : null;
    return name === null ? [] : [{ name, sprite: content.auxiliarySprites[auxiliarySpriteKeyOf(name)] ?? null }];
  });
}

function characterTraits(character: CharacterDefinition, content: GalleryContent): GalleryTrait[] {
  const { behavior } = character;
  return [
    { label: 'Prioridade de alvo', value: TARGET_PRIORITY_LABELS[behavior.targetPriority] },
    { label: 'Movimento', value: MOVEMENT_LABELS[behavior.movement] },
    { label: 'Distância preferida', value: `${behavior.preferredDistance} ${behavior.preferredDistance === 1 ? 'casa' : 'casas'}` },
    { label: 'Custo na loja', value: `${content.config.shop.costByRarity[character.rarity]} moedas` },
  ];
}

function characterEntry(character: CharacterDefinition, content: GalleryContent, synergy: GallerySynergy | null): GalleryEntry {
  return {
    id: character.id,
    name: character.name,
    archetype: character.archetype,
    description: character.description,
    rarityLabel: RARITY_LABELS[character.rarity],
    rarityColor: colorToCss(RARITY_COLORS[character.rarity]),
    synergy,
    ability: abilityModelOf(character),
    attack: attackModelOf(character),
    attributes: attributesOf(character),
    traits: characterTraits(character, content),
    summons: summonsOf(character, content),
    sprite: character.sprite ?? null,
  };
}

function towerEntry(content: GalleryContent): GalleryEntry {
  const { tower } = content.config;
  const character = buildTowerCharacter(tower);
  return {
    ...characterEntry(character, content, null),
    attack: null,
    // A torre não ataca nem se move: só a vida importa.
    attributes: attributesOf(character).filter((attribute) => attribute.key === 'health'),
    traits: [
      { label: 'Custo na loja', value: `${tower.cost} moedas` },
      { label: 'Renda por rodada', value: `+${tower.incomePerRound} moedas` },
      { label: 'Se for destruída', value: `+${tower.compensationOnLoss} moedas, uma única vez` },
      { label: 'Máximo por jogador', value: String(tower.maximumOwned) },
    ],
    sprite: content.auxiliarySprites[TOWER_SPRITE_KEY] ?? null,
  };
}

/** `synergyMapping` é a distribuição vigente; sem ela, vale a de lançamento do conteúdo. */
export function buildGalleryModel(content: GalleryContent, synergyMapping: SynergyMapping = content.initialSynergyMapping): GalleryModel {
  const synergies = content.synergies.map(toGallerySynergy);
  const synergyById = new Map(synergies.map((synergy) => [synergy.id, synergy]));
  const characters = content.characters
    .filter((character) => character.active)
    .map((character) => characterEntry(character, content, synergyById.get(synergyMapping[character.id] ?? '') ?? null));
  return { characters, tower: towerEntry(content), synergies };
}
