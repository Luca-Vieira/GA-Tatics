/** O rascunho da aba "Torres e minions" e o que se faz com ele. Lógica pura, sem DOM. */
import { characterSchema, type CharacterDefinition } from '@data/schemas/character';
import type { GameContent } from '@data/schemas/content';
import { towerConfigSchema } from '@data/schemas/gameConfig';
import { z } from 'zod';

type Json = Record<string, unknown>;

export const MAXIMUM_TOWER_VARIANTS = 8;
export const MAXIMUM_TOWER_BUFFS = 4;

const structuresSchema = z.strictObject({ tower: towerConfigSchema, characters: z.array(characterSchema) });

/** A aba edita a torre (que mora na configuração) e as invocações (que moram nas habilidades dos personagens). */
export function structuresDraftOf(content: GameContent): Json {
  return structuredClone({ tower: content.config.tower, characters: content.characters }) as unknown as Json;
}

export type StructuresResult = { readonly ok: true; readonly content: GameContent } | { readonly ok: false; readonly issues: readonly string[] };

export function applyStructuresDraft(content: GameContent, draft: Json): StructuresResult {
  const parsed = structuresSchema.safeParse(draft);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  const { tower, characters } = parsed.data;
  return { ok: true, content: { ...content, characters, config: { ...content.config, tower } } };
}

export type MinionKind = 'summon' | 'place_trap' | 'summon_decoy';

export interface MinionReference {
  readonly characterIndex: number;
  readonly effectIndex: number;
  readonly kind: MinionKind;
  readonly name: string;
  readonly characterName: string;
}

/** Toda criatura que alguma habilidade do elenco põe em campo. */
export function minionReferencesOf(characters: readonly CharacterDefinition[]): MinionReference[] {
  return characters.flatMap((character, characterIndex) =>
    character.ability.effects.flatMap((effect, effectIndex) => {
      if (effect.type !== 'summon' && effect.type !== 'place_trap' && effect.type !== 'summon_decoy') {
        return [];
      }
      const name = effect.type === 'summon_decoy' ? effect.name : effect.summon.name;
      return [{ characterIndex, effectIndex, kind: effect.type, name, characterName: character.name }];
    }),
  );
}

/** Torre personalizada nova, já válida e desligada, com id e nome que ainda não existem. */
export function newTowerVariant(existing: readonly { readonly id: string; readonly name: string }[]): Json {
  const takenIds = new Set(existing.map((tower) => tower.id));
  const takenNames = new Set(existing.map((tower) => tower.name.trim().toLowerCase()));
  let number = 1;
  while (takenIds.has(`torre_nova_${number}`) || takenNames.has(`torre nova ${number}`)) {
    number++;
  }
  return {
    id: `torre_nova_${number}`,
    name: `Torre nova ${number}`,
    active: false,
    cost: 3,
    health: 4,
    incomePerRound: 1,
    compensationOnLoss: 2,
    color: '#38bdf8',
    buffs: [{ effect: { type: 'attribute_multiplier', attribute: 'health', value: 1.1 } }],
  };
}
