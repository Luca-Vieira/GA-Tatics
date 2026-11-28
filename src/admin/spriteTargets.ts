/** Tudo o que pode receber um sprite pelo painel: os personagens e os sprites auxiliares (torre, invocações, clones). */
import { isTowerId } from '@core/tower/tower';
import { auxiliarySpriteSlotsOf } from '@data/auxiliarySprites';
import type { SpriteDefinition } from '@data/schemas/character';
import type { GameContent } from '@data/schemas/content';
import { MELEE_BODY_SCALE, RANGED_BODY_SCALE, SUMMON_BODY_SCALE } from './spriteAdjust';

export type SpriteTargetKind = 'character' | 'auxiliary';

export interface SpriteTarget {
  readonly kind: SpriteTargetKind;
  /** Id do personagem ou chave do sprite auxiliar. */
  readonly key: string;
  readonly label: string;
  /** Escala do corpo que o jogo usa para este tipo de unidade (com 1 estrela). */
  readonly bodyScale: number;
  /** Falso quando o sprite auxiliar sobrou de uma invocação que o elenco não tem mais. */
  readonly isUsed: boolean;
}

/** Prefixo dos arquivos de sprites auxiliares no servidor, para não se confundirem com os de personagens. */
const AUXILIARY_UPLOAD_PREFIX = 'aux_';
/** Tamanho máximo do id aceito pelo servidor de sprites. */
const MAXIMUM_UPLOAD_ID_LENGTH = 40;

export function targetId(target: Pick<SpriteTarget, 'kind' | 'key'>): string {
  return `${target.kind}:${target.key}`;
}

/** Id com que a imagem é enviada ao servidor (ele monta o nome do arquivo com este id e o hash da imagem). */
export function uploadIdOf(target: Pick<SpriteTarget, 'kind' | 'key'>): string {
  const id = target.kind === 'auxiliary' ? `${AUXILIARY_UPLOAD_PREFIX}${target.key}` : target.key;
  return id.slice(0, MAXIMUM_UPLOAD_ID_LENGTH);
}

function characterTargets(content: GameContent): SpriteTarget[] {
  return content.characters.map((character) => ({
    kind: 'character',
    key: character.id,
    label: character.name,
    bodyScale: character.stats.range > 1 ? RANGED_BODY_SCALE : MELEE_BODY_SCALE,
    isUsed: true,
  }));
}

function auxiliaryTarget(key: string, label: string, isUsed: boolean): SpriteTarget {
  const bodyScale = isTowerId(key) ? MELEE_BODY_SCALE : SUMMON_BODY_SCALE;
  return { kind: 'auxiliary', key, label, bodyScale, isUsed };
}

function auxiliaryTargets(content: GameContent): SpriteTarget[] {
  const slots = auxiliarySpriteSlotsOf(content.characters, content.config.tower.variants);
  const usedKeys = new Set(slots.map((slot) => slot.key));
  const leftoverKeys = Object.keys(content.auxiliarySprites).filter((key) => !usedKeys.has(key));
  return [...slots.map((slot) => auxiliaryTarget(slot.key, slot.label, true)), ...leftoverKeys.map((key) => auxiliaryTarget(key, key, false))];
}

export function spriteTargetsOf(content: GameContent): SpriteTarget[] {
  return [...characterTargets(content), ...auxiliaryTargets(content)];
}

export function spriteOfTarget(content: GameContent, target: Pick<SpriteTarget, 'kind' | 'key'>): SpriteDefinition | undefined {
  if (target.kind === 'auxiliary') {
    return content.auxiliarySprites[target.key];
  }
  return content.characters.find((character) => character.id === target.key)?.sprite;
}

/** Cópia do conteúdo com o sprite trocado; `undefined` remove (o jogo volta ao desenho provisório). */
export function withTargetSprite(content: GameContent, target: Pick<SpriteTarget, 'kind' | 'key'>, sprite: SpriteDefinition | undefined): GameContent {
  const next = structuredClone(content);
  if (target.kind === 'auxiliary') {
    if (sprite) {
      next.auxiliarySprites[target.key] = { ...sprite };
    } else {
      delete next.auxiliarySprites[target.key];
    }
    return next;
  }
  const character = next.characters.find((candidate) => candidate.id === target.key);
  if (!character) {
    return next;
  }
  if (sprite) {
    character.sprite = { ...sprite };
  } else {
    delete character.sprite;
  }
  return next;
}
