import { characterSchema, type CharacterDefinition } from '@data/schemas/character';
import { gameConfigSchema } from '@data/schemas/gameConfig';
import { MAXIMUM_SYNERGY_COUNT, MINIMUM_SYNERGY_COUNT, RESERVED_CHARACTER_IDS, validateGameContent, type GameContent } from '@data/schemas/content';
import { synergyRotationConfigSchema, synergySchema } from '@data/schemas/synergy';
import { z } from 'zod';

/** Partes do conteúdo editadas como texto JSON (os personagens têm lista própria). */
export type TextSection = 'synergies' | 'config' | 'rotation';

export type EditResult = { readonly ok: true; readonly content: GameContent } | { readonly ok: false; readonly error: string };

const synergiesSchema = z.array(synergySchema);
const rotationSectionSchema = z.strictObject({
  rotation: synergyRotationConfigSchema,
  initialSynergyMapping: z.record(z.string(), z.string()),
});

export function cloneContent(content: GameContent): GameContent {
  return structuredClone(content);
}

/** Texto JSON, formatado, da parte pedida. */
export function sectionText(content: GameContent, section: TextSection): string {
  switch (section) {
    case 'synergies':
      return JSON.stringify(content.synergies, null, 2);
    case 'config':
      return JSON.stringify(content.config, null, 2);
    case 'rotation':
      return JSON.stringify({ rotation: content.rotation, initialSynergyMapping: content.initialSynergyMapping }, null, 2);
  }
}

export function characterText(character: CharacterDefinition): string {
  return JSON.stringify(character, null, 2);
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`).join('\n');
}

function parseJson(text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `JSON inválido: ${error instanceof Error ? error.message : 'erro de leitura'}` };
  }
}

/** Troca uma das partes de texto do conteúdo, depois de validar só aquela parte (a validação completa roda ao publicar). */
export function applySectionText(content: GameContent, section: TextSection, text: string): EditResult {
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  const next = cloneContent(content);
  switch (section) {
    case 'synergies': {
      const parsed = synergiesSchema.safeParse(json.value);
      if (!parsed.success) {
        return { ok: false, error: describeIssues(parsed.error) };
      }
      return { ok: true, content: { ...next, synergies: parsed.data } };
    }
    case 'config': {
      const parsed = gameConfigSchema.safeParse(json.value);
      if (!parsed.success) {
        return { ok: false, error: describeIssues(parsed.error) };
      }
      return { ok: true, content: { ...next, config: parsed.data } };
    }
    case 'rotation': {
      const parsed = rotationSectionSchema.safeParse(json.value);
      if (!parsed.success) {
        return { ok: false, error: describeIssues(parsed.error) };
      }
      return { ok: true, content: { ...next, rotation: parsed.data.rotation, initialSynergyMapping: parsed.data.initialSynergyMapping } };
    }
  }
}

/** Troca um personagem pelo texto editado. */
export function applyCharacterText(content: GameContent, index: number, text: string): EditResult {
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  const parsed = characterSchema.safeParse(json.value);
  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.error) };
  }
  if (index < 0 || index >= content.characters.length) {
    return { ok: false, error: 'Personagem inexistente.' };
  }
  const characters = content.characters.map((character, position) => (position === index ? parsed.data : character));
  return { ok: true, content: { ...cloneContent(content), characters } };
}

/** Primeiro id livre da forma `base`, `base_2`, `base_3`... */
export function uniqueCharacterId(base: string, existingIds: readonly string[]): string {
  if (!existingIds.includes(base)) {
    return base;
  }
  let suffix = 2;
  while (existingIds.includes(`${base}_${suffix}`)) {
    suffix++;
  }
  return `${base}_${suffix}`;
}

/** Acrescenta uma cópia do personagem (ou de um modelo) como novo personagem inativo, pronto para ser editado. */
export function addCharacterFrom(content: GameContent, templateIndex: number): GameContent {
  const template = content.characters[templateIndex] ?? content.characters[0];
  if (!template) {
    return content;
  }
  const id = uniqueCharacterId(`${template.id}_copia`, content.characters.map((character) => character.id));
  const copy: CharacterDefinition = { ...structuredClone(template), id, name: `${template.name} (cópia)`, active: false };
  return { ...cloneContent(content), characters: [...content.characters, copy] };
}

/** Remove o personagem e o tira das distribuições de sinergia. */
export function removeCharacter(content: GameContent, index: number): GameContent {
  const removed = content.characters[index];
  if (!removed) {
    return content;
  }
  const next = cloneContent(content);
  next.characters = next.characters.filter((_, position) => position !== index);
  delete next.initialSynergyMapping[removed.id];
  if (next.rotation.override) {
    delete next.rotation.override[removed.id];
  }
  return next;
}

export function setCharacterActive(content: GameContent, index: number, isActive: boolean): GameContent {
  const next = cloneContent(content);
  const character = next.characters[index];
  if (character) {
    character.active = isActive;
  }
  return next;
}

export interface ImportOptions {
  /** Importa tudo como inativo (não aparece na loja até ser colocado numa sinergia). */
  readonly asInactive: boolean;
  /** Se o id já existe, troca o personagem (senão a importação é recusada). */
  readonly replaceExisting: boolean;
}

export type ImportResult =
  | { readonly ok: true; readonly content: GameContent; readonly added: readonly string[]; readonly replaced: readonly string[]; readonly notes: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

const MAXIMUM_IMPORT_CHARACTERS = 50;
const MAXIMUM_IMPORT_CHARACTERS_TEXT_LENGTH = 500_000;

/** Aceita um personagem, uma lista deles ou `{ "characters": [...] }`. */
function importItemsOf(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    const wrapped = (value as { characters?: unknown }).characters;
    return Array.isArray(wrapped) ? wrapped : [value];
  }
  return null;
}

/**
 * Importa personagens de um texto JSON. Tudo ou nada: se qualquer um tiver problema, nada é importado e a resposta
 * lista os problemas de cada personagem. O campo `sprite` é ignorado (o caminho precisa vir de um envio pelo painel).
 */
export function importCharacters(content: GameContent, text: string, options: ImportOptions): ImportResult {
  if (text.length > MAXIMUM_IMPORT_CHARACTERS_TEXT_LENGTH) {
    return { ok: false, errors: ['O texto é grande demais para importar.'] };
  }
  const json = parseJson(text);
  if (!json.ok) {
    return { ok: false, errors: [json.error] };
  }
  const items = importItemsOf(json.value);
  if (!items || items.length === 0) {
    return { ok: false, errors: ['O JSON precisa ser um personagem, uma lista de personagens ou { "characters": [...] }.'] };
  }
  if (items.length > MAXIMUM_IMPORT_CHARACTERS) {
    return { ok: false, errors: [`Importe no máximo ${MAXIMUM_IMPORT_CHARACTERS} personagens por vez.`] };
  }

  const errors: string[] = [];
  const notes: string[] = [];
  const parsedCharacters: CharacterDefinition[] = [];
  const idsInImport = new Set<string>();
  items.forEach((item, position) => {
    const label = `Personagem ${position + 1}`;
    const withoutSprite = typeof item === 'object' && item !== null && 'sprite' in item ? { ...(item as Record<string, unknown>), sprite: undefined } : item;
    if (withoutSprite !== item) {
      notes.push(`${label}: o campo "sprite" foi ignorado; envie a imagem pelo painel depois de importar.`);
    }
    const parsed = characterSchema.safeParse(withoutSprite);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => errors.push(`${label}: ${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`));
      return;
    }
    const character = options.asInactive ? { ...parsed.data, active: false } : parsed.data;
    if (RESERVED_CHARACTER_IDS.includes(character.id)) {
      errors.push(`${label}: o id "${character.id}" é reservado.`);
    }
    if (idsInImport.has(character.id)) {
      errors.push(`${label}: o id "${character.id}" aparece mais de uma vez no texto.`);
    }
    idsInImport.add(character.id);
    parsedCharacters.push(character);
  });
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const existingIds = new Set(content.characters.map((character) => character.id));
  const clashing = parsedCharacters.filter((character) => existingIds.has(character.id));
  if (clashing.length > 0 && !options.replaceExisting) {
    return { ok: false, errors: clashing.map((character) => `O id "${character.id}" já existe. Marque "Substituir se o id já existir" ou mude o id.`) };
  }

  const next = cloneContent(content);
  const added: string[] = [];
  const replaced: string[] = [];
  for (const character of parsedCharacters) {
    const position = next.characters.findIndex((candidate) => candidate.id === character.id);
    if (position >= 0) {
      // Quem é substituído mantém o sprite que já tinha.
      const previous = next.characters[position] as CharacterDefinition;
      next.characters[position] = previous.sprite ? { ...character, sprite: previous.sprite } : character;
      replaced.push(character.id);
    } else {
      next.characters.push(character);
      added.push(character.id);
    }
  }
  return { ok: true, content: next, added, replaced, notes };
}

/** Problemas do conteúdo inteiro (as mesmas verificações que o servidor faz ao publicar). */
export function contentIssues(content: GameContent): string[] {
  const result = validateGameContent(content);
  return result.ok ? [] : [...result.issues];
}

/** Há diferença entre o que está sendo editado e o que está publicado? */
export function hasChanges(published: GameContent, working: GameContent): boolean {
  return JSON.stringify(published) !== JSON.stringify(working);
}

// --- Sinergias -------------------------------------------------------------------------------------

/** Acrescenta uma cópia da sinergia (ou de um modelo) como nova sinergia. Ela nasce sem personagens: é preciso distribuí-los. */
export function addSynergyFrom(content: GameContent, templateIndex: number): EditResult {
  if (content.synergies.length >= MAXIMUM_SYNERGY_COUNT) {
    return { ok: false, error: `O jogo aceita no máximo ${MAXIMUM_SYNERGY_COUNT} sinergias.` };
  }
  const template = content.synergies[templateIndex] ?? content.synergies[0];
  if (!template) {
    return { ok: false, error: 'Não há sinergia para copiar.' };
  }
  const id = uniqueCharacterId(`${template.id}_copia`, content.synergies.map((synergy) => synergy.id));
  const copy = { ...structuredClone(template), id, name: `${template.name} (cópia)`, fullName: `${template.fullName} (cópia)` };
  return { ok: true, content: { ...cloneContent(content), synergies: [...content.synergies, copy] } };
}

/** Distribui os personagens de `memberIds` entre as sinergias restantes, sempre na que tem menos personagens. */
function redistribute(mapping: Record<string, string>, memberIds: readonly string[], remainingIds: readonly string[]): void {
  for (const characterId of [...memberIds].sort()) {
    const smallest = [...remainingIds].sort((first, second) => countIn(mapping, first) - countIn(mapping, second))[0];
    if (smallest) {
      mapping[characterId] = smallest;
    }
  }
}

function countIn(mapping: Readonly<Record<string, string>>, synergyId: string): number {
  return Object.values(mapping).filter((value) => value === synergyId).length;
}

/** Remove a sinergia; os personagens dela vão para as outras (as que têm menos). O jogo exige ao menos 3 sinergias. */
export function removeSynergy(content: GameContent, index: number): EditResult {
  const removed = content.synergies[index];
  if (!removed) {
    return { ok: false, error: 'Sinergia inexistente.' };
  }
  if (content.synergies.length <= MINIMUM_SYNERGY_COUNT) {
    return { ok: false, error: `O jogo precisa de pelo menos ${MINIMUM_SYNERGY_COUNT} sinergias.` };
  }
  const next = cloneContent(content);
  next.synergies = next.synergies.filter((_, position) => position !== index);
  const remainingIds = next.synergies.map((synergy) => synergy.id);
  const reassign = (mapping: Record<string, string>) => {
    const members = Object.keys(mapping).filter((characterId) => mapping[characterId] === removed.id);
    redistribute(mapping, members, remainingIds);
  };
  reassign(next.initialSynergyMapping);
  if (next.rotation.override) {
    reassign(next.rotation.override);
  }
  return { ok: true, content: next };
}

/** Coloca o personagem na sinergia (distribuição de lançamento). */
export function setCharacterSynergy(content: GameContent, characterId: string, synergyId: string): GameContent {
  const next = cloneContent(content);
  next.initialSynergyMapping[characterId] = synergyId;
  return next;
}

export interface SynergyCount {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly count: number;
}

/** Quantos personagens ativos há em cada sinergia na distribuição de lançamento. */
export function synergyCounts(content: GameContent): SynergyCount[] {
  const activeIds = new Set(content.characters.filter((character) => character.active).map((character) => character.id));
  return content.synergies.map((synergy) => ({
    id: synergy.id,
    name: synergy.name,
    color: synergy.color,
    count: Object.entries(content.initialSynergyMapping).filter(([characterId, synergyId]) => synergyId === synergy.id && activeIds.has(characterId)).length,
  }));
}

export interface SynergyImportResult {
  readonly ok: true;
  readonly content: GameContent;
  readonly added: readonly string[];
  readonly replaced: readonly string[];
}

/** Importa sinergias de um texto JSON: uma, uma lista ou `{ "synergies": [...] }`. Tudo ou nada. */
export function importSynergies(content: GameContent, text: string, options: { readonly replaceExisting: boolean }): SynergyImportResult | { readonly ok: false; readonly errors: readonly string[] } {
  const json = parseJson(text);
  if (!json.ok) {
    return { ok: false, errors: [json.error] };
  }
  const value = json.value;
  const items = Array.isArray(value) ? value : typeof value === 'object' && value !== null ? (Array.isArray((value as { synergies?: unknown }).synergies) ? (value as { synergies: unknown[] }).synergies : [value]) : null;
  if (!items || items.length === 0) {
    return { ok: false, errors: ['O JSON precisa ser uma sinergia, uma lista de sinergias ou { "synergies": [...] }.'] };
  }

  const errors: string[] = [];
  const parsed: z.infer<typeof synergySchema>[] = [];
  const idsInImport = new Set<string>();
  items.forEach((item, position) => {
    const label = `Sinergia ${position + 1}`;
    const result = synergySchema.safeParse(item);
    if (!result.success) {
      result.error.issues.forEach((issue) => errors.push(`${label}: ${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`));
      return;
    }
    if (idsInImport.has(result.data.id)) {
      errors.push(`${label}: o id "${result.data.id}" aparece mais de uma vez no texto.`);
    }
    idsInImport.add(result.data.id);
    parsed.push(result.data);
  });
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const existingIds = new Set(content.synergies.map((synergy) => synergy.id));
  const clashing = parsed.filter((synergy) => existingIds.has(synergy.id));
  if (clashing.length > 0 && !options.replaceExisting) {
    return { ok: false, errors: clashing.map((synergy) => `O id "${synergy.id}" já existe. Marque "Substituir se o id já existir" ou mude o id.`) };
  }
  const newOnes = parsed.filter((synergy) => !existingIds.has(synergy.id));
  if (content.synergies.length + newOnes.length > MAXIMUM_SYNERGY_COUNT) {
    return { ok: false, errors: [`O jogo aceita no máximo ${MAXIMUM_SYNERGY_COUNT} sinergias (hoje há ${content.synergies.length}).`] };
  }

  const next = cloneContent(content);
  const added: string[] = [];
  const replaced: string[] = [];
  for (const synergy of parsed) {
    const position = next.synergies.findIndex((candidate) => candidate.id === synergy.id);
    if (position >= 0) {
      next.synergies[position] = synergy;
      replaced.push(synergy.id);
    } else {
      next.synergies.push(synergy);
      added.push(synergy.id);
    }
  }
  return { ok: true, content: next, added, replaced };
}
