import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { validateGameContent } from '@data/schemas/content';
import {
  applyAlignment,
  clampAdjustment,
  DEFAULT_SPRITE_ADJUSTMENT,
  dragAdjustment,
  mirrorBox,
  placeSprite,
  SpriteAdjustmentSession,
} from './spriteAdjust';
import { spriteOfTarget, spriteTargetsOf, uploadIdOf, withTargetSprite } from './spriteTargets';

const IMAGE = { width: 64, height: 128 };
const PATH = '/sprites/aux_cavalo-0123456789ab.png';

describe('encaixe do sprite (a mesma conta do jogo)', () => {
  it('no padrão, a imagem tem a altura da cápsula e a base nos pés, centralizada', () => {
    expect(placeSprite(DEFAULT_SPRITE_ADJUSTMENT, IMAGE, 1)).toEqual({ left: -16, top: -64, width: 32, height: 64 });
  });

  it('a escala do corpo multiplica o tamanho e o deslocamento', () => {
    const box = placeSprite({ ...DEFAULT_SPRITE_ADJUSTMENT, scale: 2, offsetX: 10, offsetY: -4 }, IMAGE, 0.5);
    expect(box).toEqual({ left: 5 - 16, top: -2 - 64, width: 32, height: 64 });
  });

  it('virar para a esquerda espelha o retângulo em torno dos pés', () => {
    expect(mirrorBox({ left: 4, top: -60, width: 30, height: 60 })).toEqual({ left: -34, top: -60, width: 30, height: 60 });
  });

  it('os atalhos de alinhamento mexem só no que dizem', () => {
    const moved = { scale: 2, offsetX: 7, offsetY: 9, anchorX: 0.2, anchorY: 0.3 };
    expect(applyAlignment(moved, 'feet')).toEqual({ ...moved, anchorY: 1, offsetY: 0 });
    expect(applyAlignment(moved, 'center_horizontal')).toEqual({ ...moved, anchorX: 0.5, offsetX: 0 });
    expect(applyAlignment(moved, 'center_cell')).toEqual({ scale: 2, offsetX: 0, offsetY: 0, anchorX: 0.5, anchorY: 0.5 });
  });

  it('arrastar converte o movimento em posição, invertendo a horizontal quando olha para a esquerda', () => {
    expect(dragAdjustment(DEFAULT_SPRITE_ADJUSTMENT, 10, 5, 0.5, 'right')).toMatchObject({ offsetX: 20, offsetY: 10 });
    expect(dragAdjustment(DEFAULT_SPRITE_ADJUSTMENT, 10, 5, 0.5, 'left')).toMatchObject({ offsetX: -20, offsetY: 10 });
  });

  it('os valores ficam dentro do que o jogo aceita', () => {
    expect(clampAdjustment({ scale: 0, offsetX: 9999, offsetY: -9999, anchorX: 2, anchorY: -1 })).toEqual({ scale: 0.1, offsetX: 500, offsetY: -500, anchorX: 1, anchorY: 0 });
  });
});

describe('ajuste em andamento', () => {
  it('um gesto com vários valores intermediários é um só passo de desfazer', () => {
    const session = new SpriteAdjustmentSession(DEFAULT_SPRITE_ADJUSTMENT);
    session.preview({ ...DEFAULT_SPRITE_ADJUSTMENT, offsetX: 3 });
    session.preview({ ...DEFAULT_SPRITE_ADJUSTMENT, offsetX: 8 });
    session.record();
    expect(session.isDirty).toBe(true);
    session.undo();
    expect(session.current).toEqual(DEFAULT_SPRITE_ADJUSTMENT);
    expect(session.isDirty).toBe(false);
    expect(session.canUndo).toBe(false);
  });

  it('restaurar o padrão e voltar ao aplicado também podem ser desfeitos', () => {
    const applied = { ...DEFAULT_SPRITE_ADJUSTMENT, scale: 1.5 };
    const session = new SpriteAdjustmentSession(applied);
    session.restoreDefault();
    expect(session.current).toEqual(DEFAULT_SPRITE_ADJUSTMENT);
    session.discard();
    expect(session.current).toEqual(applied);
    session.undo();
    expect(session.current).toEqual(DEFAULT_SPRITE_ADJUSTMENT);
  });

  it('depois de aplicado, não há mais mudança pendente', () => {
    const session = new SpriteAdjustmentSession(DEFAULT_SPRITE_ADJUSTMENT);
    session.change({ ...DEFAULT_SPRITE_ADJUSTMENT, offsetY: 6 });
    session.markApplied();
    expect(session.isDirty).toBe(false);
  });
});

describe('o que pode receber sprite', () => {
  it('lista os personagens e os auxiliares do elenco (torre, cavalo, protagonista)', () => {
    const targets = spriteTargetsOf(DEFAULT_GAME_CONTENT);
    expect(targets.filter((target) => target.kind === 'character')).toHaveLength(DEFAULT_GAME_CONTENT.characters.length);
    expect(targets.filter((target) => target.kind === 'auxiliary').map((target) => target.key)).toEqual(expect.arrayContaining(['torre', 'cavalo', 'protagonista']));
  });

  it('os arquivos dos auxiliares levam prefixo próprio e cabem no limite do servidor', () => {
    expect(uploadIdOf({ kind: 'auxiliary', key: 'cavalo' })).toBe('aux_cavalo');
    expect(uploadIdOf({ kind: 'character', key: 'leo' })).toBe('leo');
    expect(uploadIdOf({ kind: 'auxiliary', key: 'a'.repeat(40) })).toHaveLength(40);
  });

  it('grava, lê e remove o sprite sem mexer no conteúdo original, mantendo-o válido', () => {
    const target = { kind: 'auxiliary', key: 'cavalo' } as const;
    const sprite = { path: PATH, ...DEFAULT_SPRITE_ADJUSTMENT, offsetY: 4 };
    const withSprite = withTargetSprite(DEFAULT_GAME_CONTENT, target, sprite);
    expect(spriteOfTarget(withSprite, target)).toEqual(sprite);
    expect(spriteOfTarget(DEFAULT_GAME_CONTENT, target)).toBeUndefined();
    expect(validateGameContent(withSprite).ok).toBe(true);
    expect(withTargetSprite(withSprite, target, undefined).auxiliarySprites).toEqual({});
  });

  it('um sprite que sobrou de uma invocação removida continua na lista, marcado como sem uso', () => {
    const leftover = withTargetSprite(DEFAULT_GAME_CONTENT, { kind: 'auxiliary', key: 'dragao' }, { path: PATH, ...DEFAULT_SPRITE_ADJUSTMENT });
    expect(spriteTargetsOf(leftover).find((target) => target.key === 'dragao')?.isUsed).toBe(false);
  });

  it('o sprite de um personagem fica no próprio personagem', () => {
    const target = { kind: 'character', key: 'leo' } as const;
    const changed = withTargetSprite(DEFAULT_GAME_CONTENT, target, { path: '/sprites/leo-0123456789ab.png', ...DEFAULT_SPRITE_ADJUSTMENT });
    expect(changed.characters.find((character) => character.id === 'leo')?.sprite?.path).toContain('leo-');
    expect(withTargetSprite(changed, target, undefined).characters.find((character) => character.id === 'leo')?.sprite).toBeUndefined();
  });
});
