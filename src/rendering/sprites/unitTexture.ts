import Phaser from 'phaser';

export const UNIT_BODY_TEXTURE = 'unit-body';
export const TOWER_BODY_TEXTURE = 'tower-body';
/** Tamanho do boneco em unidades de tela (a imagem enviada pelo painel é ajustada a esta altura). */
export const UNIT_BODY_TEXTURE_WIDTH = 48;
export const UNIT_BODY_TEXTURE_HEIGHT = 64;

/** A textura é gerada maior que o tamanho de tela para continuar nítida em telas densas. */
export const BODY_TEXTURE_SCALE = 2;

const OUTLINE = { color: 0x000000, alpha: 0.5, width: 2 };
// O corpo é tingido com a cor do time: branco vira a cor cheia, cinza vira um tom mais escuro dela.
const FULL = 0xffffff;
const SHADED = 0xc4c4c4;
const DARK = 0x6b6b6b;
const INK = 0x141414;

type Draw = Phaser.GameObjects.Graphics;

/**
 * Sprites provisórios: um bonequinho de perfil, olhando para a DIREITA (a arte enviada pelo painel segue a mesma
 * regra), e a torre.
 */
export function ensureUnitBodyTexture(scene: Phaser.Scene): void {
  ensureTexture(scene, UNIT_BODY_TEXTURE, [drawLegs, drawTorso, drawHead, drawFrontArm]);
  ensureTexture(scene, TOWER_BODY_TEXTURE, [drawTower]);
}

function ensureTexture(scene: Phaser.Scene, key: string, parts: readonly ((graphics: Draw) => void)[]): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.setScale(BODY_TEXTURE_SCALE);
  parts.forEach((drawPart) => drawPart(graphics));
  graphics.generateTexture(key, UNIT_BODY_TEXTURE_WIDTH * BODY_TEXTURE_SCALE, UNIT_BODY_TEXTURE_HEIGHT * BODY_TEXTURE_SCALE);
  graphics.destroy();
}

/** Torre de pedra com ameias, porta e uma janela. */
function drawTower(graphics: Draw): void {
  part(graphics, SHADED, 9, 16, 30, 46, 3);
  part(graphics, FULL, 5, 10, 38, 11, 2);
  [5, 20, 35].forEach((x) => part(graphics, FULL, x, 2, 8, 10, 1));
  part(graphics, DARK, 5, 57, 38, 6, 2);
  part(graphics, INK, 19, 44, 10, 18, 4);
  part(graphics, INK, 21, 27, 6, 9, 3);
}

function part(graphics: Draw, color: number, x: number, y: number, width: number, height: number, radius: number): void {
  graphics.fillStyle(color, 1);
  graphics.fillRoundedRect(x, y, width, height, radius);
  graphics.lineStyle(OUTLINE.width, OUTLINE.color, OUTLINE.alpha);
  graphics.strokeRoundedRect(x, y, width, height, radius);
}

function drawLegs(graphics: Draw): void {
  part(graphics, DARK, 12, 47, 9, 15, 3);
  part(graphics, SHADED, 24, 47, 9, 15, 3);
  part(graphics, INK, 12, 58, 13, 5, 2);
  part(graphics, INK, 24, 58, 14, 5, 2);
}

function drawTorso(graphics: Draw): void {
  part(graphics, FULL, 8, 25, 27, 27, 10);
}

/** Cabeça deslocada para a frente, com nariz, um olho e o cabelo atrás: é o que mostra para onde o boneco olha. */
function drawHead(graphics: Draw): void {
  graphics.fillStyle(FULL, 1);
  graphics.fillCircle(25, 15, 13);
  graphics.lineStyle(OUTLINE.width, OUTLINE.color, OUTLINE.alpha);
  graphics.strokeCircle(25, 15, 13);
  graphics.fillStyle(FULL, 1);
  graphics.fillTriangle(36, 13, 45, 19, 36, 22);
  graphics.fillStyle(DARK, 1);
  graphics.slice(25, 15, 13.5, Phaser.Math.DegToRad(112), Phaser.Math.DegToRad(318), false);
  graphics.fillPath();
  graphics.fillStyle(INK, 1);
  graphics.fillEllipse(33, 13, 4, 6);
}

function drawFrontArm(graphics: Draw): void {
  part(graphics, SHADED, 21, 29, 21, 8, 4);
  graphics.fillStyle(FULL, 1);
  graphics.fillCircle(42, 33, 4.5);
  graphics.lineStyle(OUTLINE.width, OUTLINE.color, OUTLINE.alpha);
  graphics.strokeCircle(42, 33, 4.5);
}
