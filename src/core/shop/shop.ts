import type { CharacterDefinition, Rarity } from '@data/schemas/character';
import type { ShopConfig } from '@data/schemas/gameConfig';
import type { SeededRandom } from '@shared/utils/random';
import type { ShopSlot } from '../players/playerState';

const RARITIES: readonly Rarity[] = ['common', 'rare', 'special'];

export function costOf(config: ShopConfig, character: CharacterDefinition): number {
  return config.costByRarity[character.rarity];
}

/** Valor de venda de uma unidade pela estrela (GDD 2.4). */
export function sellValueOf(config: ShopConfig, starLevel: 1 | 2 | 3): number {
  return config.sellValueByStar[starLevel - 1] as number;
}

/** Sorteia as ofertas da loja: primeiro a raridade (pelos pesos), depois o personagem entre os dessa raridade. */
export function rollShopOffer(random: SeededRandom, roster: readonly CharacterDefinition[], config: ShopConfig): ShopSlot[] {
  const activeCharacters = roster.filter((character) => character.active);
  const charactersByRarity = new Map<Rarity, CharacterDefinition[]>(RARITIES.map((rarity) => [rarity, activeCharacters.filter((character) => character.rarity === rarity)]));
  // Raridade sem personagens ativos não pode ser sorteada.
  const availableRarities = RARITIES.filter((rarity) => (charactersByRarity.get(rarity)?.length ?? 0) > 0 && config.rarityWeights[rarity] > 0);
  if (availableRarities.length === 0) {
    return [];
  }

  const offer: ShopSlot[] = [];
  for (let slot = 0; slot < config.offerSize; slot++) {
    const rarity = pickRarity(random, availableRarities, config);
    const character = random.pick(charactersByRarity.get(rarity) as CharacterDefinition[]);
    offer.push({ characterId: character.id, cost: costOf(config, character) });
  }
  return offer;
}

function pickRarity(random: SeededRandom, rarities: readonly Rarity[], config: ShopConfig): Rarity {
  const totalWeight = rarities.reduce((total, rarity) => total + config.rarityWeights[rarity], 0);
  let roll = random.next() * totalWeight;
  for (const rarity of rarities) {
    roll -= config.rarityWeights[rarity];
    if (roll < 0) {
      return rarity;
    }
  }
  return rarities[rarities.length - 1] as Rarity;
}
