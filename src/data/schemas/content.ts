import { z } from 'zod';
import { characterSchema, spriteDefinitionSchema } from './character';
import { gameConfigSchema } from './gameConfig';
import { synergyRotationConfigSchema, synergySchema, validateSynergyMapping } from './synergy';

/** Quantidade de sinergias aceita: de 3 a 5 (o painel do jogo tem espaço para até 5 linhas). */
export const MINIMUM_SYNERGY_COUNT = 3;
export const MAXIMUM_SYNERGY_COUNT = 5;
/** Sprites vêm do servidor: `/sprites/<id>-<hash de 12 caracteres>.png` (o servidor guarda e entrega o arquivo). */
export const SPRITE_PATH_PATTERN = /^\/sprites\/[a-z0-9_]{1,40}-[0-9a-f]{12}\.png$/;
export const AUXILIARY_SPRITE_KEY_PATTERN = /^[a-z0-9_]{1,40}$/;
/** Id usado pela torre da loja; nenhum personagem pode usá-lo. */
export const RESERVED_CHARACTER_IDS: readonly string[] = ['torre'];

/**
 * Tudo o que o painel de administração pode editar e que o servidor entrega aos clientes:
 * elenco, sinergias, configuração, regra de rotação e a distribuição de sinergias de lançamento.
 */
export const gameContentSchema = z
  .strictObject({
    characters: z.array(characterSchema).min(1),
    synergies: z.array(synergySchema).min(MINIMUM_SYNERGY_COUNT).max(MAXIMUM_SYNERGY_COUNT),
    config: gameConfigSchema,
    rotation: synergyRotationConfigSchema,
    /** Rotação 0: personagem → sinergia. Precisa cobrir todos os personagens ativos, com ao menos 4 em cada sinergia. */
    initialSynergyMapping: z.record(z.string(), z.string()),
    /** Sprites do que não é personagem (cavalo, protagonista, torre...), por chave (veja `auxiliarySprites.ts`). */
    auxiliarySprites: z.record(z.string().regex(AUXILIARY_SPRITE_KEY_PATTERN, 'Chave de sprite auxiliar inválida.'), spriteDefinitionSchema).default({}),
  })
  .superRefine((content, context) => {
    const addIssue = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path, message });

    const seenIds = new Set<string>();
    content.characters.forEach((character, position) => {
      if (seenIds.has(character.id)) {
        addIssue(['characters', position, 'id'], `Id de personagem repetido: ${character.id}`);
      }
      seenIds.add(character.id);
      if (RESERVED_CHARACTER_IDS.includes(character.id)) {
        addIssue(['characters', position, 'id'], `O id "${character.id}" é reservado.`);
      }
      if (character.sprite && !SPRITE_PATH_PATTERN.test(character.sprite.path)) {
        addIssue(['characters', position, 'sprite', 'path'], 'O sprite precisa ser enviado pelo painel (caminho /sprites/<id>-<hash>.png).');
      }
    });

    for (const [key, sprite] of Object.entries(content.auxiliarySprites)) {
      if (!SPRITE_PATH_PATTERN.test(sprite.path)) {
        addIssue(['auxiliarySprites', key, 'path'], 'O sprite precisa ser enviado pelo painel (caminho /sprites/<id>-<hash>.png).');
      }
    }

    const synergyIds = new Set<string>();
    content.synergies.forEach((synergy, position) => {
      if (synergyIds.has(synergy.id)) {
        addIssue(['synergies', position, 'id'], `Id de sinergia repetido: ${synergy.id}`);
      }
      synergyIds.add(synergy.id);
    });

    checkMapping(content.initialSynergyMapping, ['initialSynergyMapping'], content, addIssue);
    if (content.rotation.override) {
      checkMapping(content.rotation.override, ['rotation', 'override'], content, addIssue);
    }
  });

export type GameContent = z.infer<typeof gameContentSchema>;

function checkMapping(
  mapping: Readonly<Record<string, string>>,
  path: (string | number)[],
  content: Pick<GameContent, 'characters' | 'synergies'>,
  addIssue: (path: (string | number)[], message: string) => void,
): void {
  const characterIds = new Set(content.characters.map((character) => character.id));
  for (const characterId of Object.keys(mapping)) {
    if (!characterIds.has(characterId)) {
      addIssue([...path, characterId], `A distribuição cita um personagem que não existe: ${characterId}`);
    }
  }
  for (const character of content.characters) {
    if (character.active && mapping[character.id] === undefined) {
      addIssue(path, `O personagem ativo "${character.id}" não tem sinergia na distribuição.`);
    }
  }
  try {
    validateSynergyMapping(mapping, content.synergies);
  } catch (error) {
    addIssue(path, error instanceof Error ? error.message : 'Distribuição de sinergias inválida.');
  }
}

export type ContentValidationResult = { readonly ok: true; readonly content: GameContent } | { readonly ok: false; readonly issues: readonly string[] };

/** Valida dados brutos (o que veio do painel ou do arquivo) e devolve o conteúdo ou uma lista de problemas legíveis. */
export function validateGameContent(raw: unknown): ContentValidationResult {
  const parsed = gameContentSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, content: parsed.data };
  }
  const issues = parsed.error.issues.map((issue) => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`);
  return { ok: false, issues };
}
