import Phaser from 'phaser';
import type { StatusKind } from '@data/schemas/ability';
import type { Point } from '@shared/utils/hex';
import { idleMotion, walkMotion } from '../animations/proceduralMotion';
import { bySize, isCompactDisplay } from '../layout/displayProfile';
import { markTransient } from '../particles/transient';
import { addText } from '../ui/theme';
import type { SpriteAppearance } from './spriteRegistry';
import { BODY_TEXTURE_SCALE, TOWER_BODY_TEXTURE, UNIT_BODY_TEXTURE, UNIT_BODY_TEXTURE_HEIGHT, UNIT_BODY_TEXTURE_WIDTH } from './unitTexture';

/** Efeitos e textos usam profundidades acima de qualquer unidade (a profundidade de uma unidade é a altura dos seus pés na tela). */
export const FLOATING_TEXT_DEPTH = 20_000;
export const PROJECTILE_DEPTH = 15_000;
export const OVERLAY_DEPTH = 30_000;

const HEALTH_BAR_WIDTH = 46;
const HEALTH_BAR_HEIGHT = 6;
const COMPACT_HEALTH_BAR_HEIGHT = 10;
const SHADOW_WIDTH = 46;
const SHADOW_HEIGHT = 16;
/** Fração da altura do corpo em que o "peito" fica; é de onde saem os projéteis. */
const CHEST_HEIGHT_RATIO = 0.55;
const STATUS_MARK_SIZE = 7;
/** Onde fica a letra no tronco do boneco provisório, em relação aos pés e ao meio da textura. */
const GLYPH_OFFSET = { x: -2, y: -22 };

/** Cor da marca que indica cada estado temporário acima da barra de vida. */
const STATUS_COLORS: Readonly<Record<StatusKind, number>> = {
  poison: 0x84cc16,
  drain: 0xdc2626,
  slow: 0x94a3b8,
  sleep: 0x67e8f9,
  weaken: 0xa855f7,
  confuse: 0xfacc15,
  damage_reduction: 0xffffff,
  speed_boost: 0xfb923c,
  damage_boost: 0xef4444,
  resting: 0x9ca3af,
};

export interface UnitViewOptions {
  /** Ponto do chão (pés) onde a unidade está. */
  readonly groundPosition: Point;
  readonly color: number;
  readonly glyph: string;
  readonly displayName: string;
  /** Estrelas da unidade (1 a 3), mostradas sob o nome. Omitido = sem estrelas. */
  readonly starLevel?: number;
  /** Cor da sinergia vigente: vira um anel colorido no chão, em volta dos pés. */
  readonly accentColor?: number;
  /** Barra de vida; some na preparação, onde não faz sentido. Padrão: visível. */
  readonly showHealthBar?: boolean;
  /** Escala do corpo; permite distinguir tipos de unidade enquanto não existem sprites reais. */
  readonly bodyScale: number;
  /** Sprite do personagem enviado pelo painel; sem ele (ou se a imagem não carregou), vale o boneco provisório. */
  readonly sprite?: SpriteAppearance;
  /** Para onde a unidade começa olhando. Padrão: direita. */
  readonly facingRight?: boolean;
  /** Desenho provisório de torre (sem letra), no lugar do boneco. */
  readonly isTower?: boolean;
  /** Escala de perspectiva para uma unidade com os pés em determinada altura da tela. */
  readonly perspectiveScaleAt: (groundY: number) => number;
}

/**
 * Representação visual de uma unidade, de pé no chão inclinado. Só apresenta: a posição lógica vem da simulação,
 * e todas as animações aqui são transformações temporárias do sprite.
 *
 * A origem do contêiner `root` são os pés da unidade; a profundidade de desenho é a altura dos pés na tela,
 * então quem está mais à frente cobre quem está atrás.
 */
export class UnitView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Container;
  private readonly lunger: Phaser.GameObjects.Container;
  private readonly shaker: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly glyph: Phaser.GameObjects.Text | null = null;
  private readonly customSprite: SpriteAppearance | undefined;
  private readonly bodyScale: number;
  private facingRight = true;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private readonly starLabel: Phaser.GameObjects.Text;
  private readonly selectionRing: Phaser.GameObjects.Graphics;
  private readonly healthBar: Phaser.GameObjects.Graphics;
  private readonly statusMarks: Phaser.GameObjects.Graphics;
  private readonly activeStatuses = new Set<StatusKind>();
  private readonly phase: number;
  private readonly color: number;
  private readonly bodyHeight: number;
  /** Metade da largura do corpo, sem perspectiva, usada para saber se um clique acertou a unidade. */
  private readonly bodyHalfWidth: number;
  private readonly hasCustomSprite: boolean;
  private readonly perspectiveScaleAt: (groundY: number) => number;
  private perspectiveScale = 1;
  private readonly showHealthBar: boolean;
  private movingUntilSimulationMs = 0;
  private healthRatio = 1;
  private dead = false;

  constructor(
    private readonly scene: Phaser.Scene,
    options: UnitViewOptions,
  ) {
    this.phase = Math.random() * Math.PI * 2;
    this.color = options.color;
    this.perspectiveScaleAt = options.perspectiveScaleAt;
    const customSprite = options.sprite && scene.textures.exists(options.sprite.textureKey) ? options.sprite : undefined;
    this.customSprite = customSprite;
    this.bodyScale = options.bodyScale;
    this.hasCustomSprite = customSprite !== undefined;
    // A altura da imagem é ajustada à do boneco provisório (e depois pela escala do painel), qualquer que seja o tamanho do arquivo.
    const sourceImage = customSprite ? scene.textures.get(customSprite.textureKey).getSourceImage() : null;
    const fit = customSprite && sourceImage ? (UNIT_BODY_TEXTURE_HEIGHT / sourceImage.height) * customSprite.scale : 1;
    this.bodyHeight = sourceImage ? sourceImage.height * fit * options.bodyScale : UNIT_BODY_TEXTURE_HEIGHT * options.bodyScale;
    this.bodyHalfWidth = sourceImage ? (sourceImage.width * fit * options.bodyScale) / 2 + 6 : (UNIT_BODY_TEXTURE_WIDTH / 2 + 6) * options.bodyScale;

    this.showHealthBar = options.showHealthBar ?? true;

    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.35);
    this.shadow.fillEllipse(0, 0, SHADOW_WIDTH * options.bodyScale, SHADOW_HEIGHT * options.bodyScale);
    // Com sprite o corpo não leva a cor do time; o anel no chão passa a mostrá-la (na preparação, é o da sinergia).
    const ringColor = options.accentColor ?? (customSprite ? options.color : undefined);
    if (ringColor !== undefined) {
      this.shadow.lineStyle(3, ringColor, 0.95);
      this.shadow.strokeEllipse(0, 0, (SHADOW_WIDTH + 8) * options.bodyScale, (SHADOW_HEIGHT + 4) * options.bodyScale);
    }
    this.selectionRing = scene.add.graphics();
    this.selectionRing.lineStyle(3, 0xffffff, 1);
    this.selectionRing.strokeEllipse(0, 0, (SHADOW_WIDTH + 22) * options.bodyScale, (SHADOW_HEIGHT + 12) * options.bodyScale);
    this.selectionRing.setVisible(false);

    this.sprite = customSprite
      ? scene.add
          .image(customSprite.offsetX * options.bodyScale, customSprite.offsetY * options.bodyScale, customSprite.textureKey)
          .setOrigin(customSprite.anchorX, customSprite.anchorY)
          .setScale(options.bodyScale * fit)
      : scene.add
          .image(0, 0, options.isTower ? TOWER_BODY_TEXTURE : UNIT_BODY_TEXTURE)
          .setOrigin(0.5, 1)
          .setTint(options.color)
          .setScale(options.bodyScale / BODY_TEXTURE_SCALE);
    const bodyParts: Phaser.GameObjects.GameObject[] = [this.sprite];
    if (!customSprite && !options.isTower) {
      this.glyph = addText(scene, GLYPH_OFFSET.x * options.bodyScale, GLYPH_OFFSET.y * options.bodyScale, options.glyph, {
        fontSize: `${Math.round(18 * options.bodyScale)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5);
      bodyParts.push(this.glyph);
    }
    // Cada movimento temporário tem seu próprio contêiner, para tweens simultâneos (avanço e tremor) não se atrapalharem.
    this.shaker = scene.add.container(0, 0, bodyParts);
    this.lunger = scene.add.container(0, 0, [this.shaker]);
    this.body = scene.add.container(0, 0, [this.lunger]);
    this.healthBar = scene.add.graphics();
    this.statusMarks = scene.add.graphics();
    // No modo compacto o nome some (o boneco tem a inicial, e tocar mostra os detalhes); sobram as estrelas, maiores.
    this.nameLabel = addText(scene, 0, 7, options.displayName, { fontSize: '13px', color: '#e5e7eb', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setVisible(!isCompactDisplay());
    this.starLabel = addText(scene, 0, bySize(20, 5), '★'.repeat(Math.max(0, Math.min(3, options.starLevel ?? 0))), {
      fontSize: bySize('12px', '19px'),
      color: '#fbbf24',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.root = scene.add.container(options.groundPosition.x, options.groundPosition.y, [
      this.shadow,
      this.selectionRing,
      this.body,
      this.nameLabel,
      this.starLabel,
      this.healthBar,
      this.statusMarks,
    ]);
    this.setFacingRight(options.facingRight ?? true);
    this.applyPerspective();
    this.drawHealthBar();
  }

  get isFacingRight(): boolean {
    return this.facingRight;
  }

  /**
   * Vira a unidade só espelhando na horizontal (sem girar). A arte olha para a direita; virada para a esquerda, a imagem
   * é espelhada em torno do ponto dos pés, então a âncora e o deslocamento horizontal também se invertem.
   */
  setFacingRight(isFacingRight: boolean): void {
    if (this.dead || isFacingRight === this.facingRight) {
      return;
    }
    this.facingRight = isFacingRight;
    this.sprite.setFlipX(!isFacingRight);
    const direction = isFacingRight ? 1 : -1;
    if (this.customSprite) {
      const anchorX = isFacingRight ? this.customSprite.anchorX : 1 - this.customSprite.anchorX;
      this.sprite.setOrigin(anchorX, this.customSprite.anchorY);
      this.sprite.setX(direction * this.customSprite.offsetX * this.bodyScale);
    }
    this.glyph?.setX(direction * GLYPH_OFFSET.x * this.bodyScale);
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Pés da unidade na tela. */
  get groundPosition(): Point {
    return { x: this.root.x, y: this.root.y };
  }

  /** Ponto na altura do peito, de onde saem e para onde vão os projéteis. */
  get chestPosition(): Point {
    return { x: this.root.x, y: this.root.y - this.bodyHeight * CHEST_HEIGHT_RATIO * this.perspectiveScale };
  }

  /** Atualiza idle e walk, perspectiva e profundidade. `simulationTimeMs` é o relógio da simulação. */
  update(simulationTimeMs: number): void {
    if (this.dead) {
      return;
    }
    this.root.setDepth(this.root.y);
    this.applyPerspective();

    const isWalking = simulationTimeMs < this.movingUntilSimulationMs;
    const motion = isWalking ? walkMotion(simulationTimeMs, this.phase) : idleMotion(simulationTimeMs, this.phase);
    this.body.y = motion.offsetY;
    this.body.rotation = motion.rotation;
  }

  /** O ponto da tela está sobre o corpo da unidade? Usado para selecionar e arrastar. */
  containsPoint(point: Point): boolean {
    const halfWidth = this.bodyHalfWidth * this.perspectiveScale;
    const height = this.bodyHeight * this.perspectiveScale;
    const isInsideHorizontally = Math.abs(point.x - this.root.x) <= halfWidth;
    const isInsideVertically = point.y <= this.root.y + 8 && point.y >= this.root.y - height - 6;
    return isInsideHorizontally && isInsideVertically;
  }

  /** Anel branco no chão que marca a unidade selecionada. */
  setSelected(isSelected: boolean): void {
    if (!this.dead) {
      this.selectionRing.setVisible(isSelected);
    }
  }

  /** Leva a unidade direto para o ponto (sem animação); usado ao arrastar e ao reorganizar a preparação. */
  placeAt(ground: Point): void {
    this.root.setPosition(ground.x, ground.y);
  }

  /** Dá destaque visual ao arrastar: levanta e deixa translúcida. */
  setDragging(isDragging: boolean): void {
    this.root.setAlpha(isDragging ? 0.75 : 1);
  }

  /** Esconde ou mostra a unidade sem destruí-la (ex.: enquanto o combate acontece). */
  setVisible(isVisible: boolean): void {
    this.root.setVisible(isVisible);
  }

  moveTo(destinationGround: Point, durationMs: number, simulationTimeMs: number): void {
    this.movingUntilSimulationMs = simulationTimeMs + durationMs;
    this.scene.tweens.add({ targets: this.root, x: destinationGround.x, y: destinationGround.y, duration: durationMs, ease: 'Sine.easeInOut' });
  }

  /** Avanço rápido em direção ao alvo (posição dos pés do alvo) e retorno. */
  playAttack(targetGround: Point): void {
    if (this.dead) {
      return;
    }
    const deltaX = targetGround.x - this.root.x;
    const deltaY = targetGround.y - this.root.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const lungeDistance = 16;
    this.scene.tweens.add({
      targets: this.lunger,
      x: (deltaX / distance) * lungeDistance,
      y: (deltaY / distance) * lungeDistance,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** Recuo com tremor e clarão vermelho, mais número de dano. */
  playHit(damage: number, healthRatio: number, numberColor = '#ffe066'): void {
    if (this.dead) {
      return;
    }
    this.setHealthRatio(healthRatio);
    this.scene.tweens.add({ targets: this.shaker, x: { from: -4, to: 4 }, duration: 45, yoyo: true, repeat: 2, ease: 'Sine.easeInOut', onComplete: () => this.shaker.setX(0) });
    this.sprite.setTintFill(0xff5555);
    this.scene.time.delayedCall(90, () => {
      if (!this.dead) {
        this.restoreTint();
      }
    });
    this.showFloatingText(String(Math.round(damage)), numberColor);
  }

  /** Dano contínuo (veneno, drenagem): só atualiza a barra e mostra o número, sem tremer. */
  playDamageOverTime(damage: number, healthRatio: number, numberColor: string): void {
    if (this.dead) {
      return;
    }
    this.setHealthRatio(healthRatio);
    this.showFloatingText(String(Math.round(damage)), numberColor);
  }

  playHeal(amount: number, healthRatio: number): void {
    if (this.dead) {
      return;
    }
    this.setHealthRatio(healthRatio);
    this.showFloatingText(`+${Math.round(amount)}`, '#4ade80');
  }

  showFloatingText(text: string, color: string): void {
    const headY = this.root.y - this.bodyHeight * this.perspectiveScale - 14;
    const floating = addText(this.scene, this.root.x, headY, text, { fontSize: bySize('19px', '28px'), color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(FLOATING_TEXT_DEPTH);
    markTransient(floating);
    this.scene.tweens.add({ targets: floating, y: floating.y - 28, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => floating.destroy() });
  }

  setStatus(status: StatusKind, isActive: boolean): void {
    if (isActive) {
      this.activeStatuses.add(status);
    } else {
      this.activeStatuses.delete(status);
    }
    this.drawStatusMarks();
  }

  /** Mostra vida e estados sem animação (ao entrar num combate já em andamento). */
  showState(healthRatio: number, statuses: readonly StatusKind[]): void {
    this.setHealthRatio(healthRatio);
    this.activeStatuses.clear();
    statuses.forEach((status) => this.activeStatuses.add(status));
    this.drawStatusMarks();
  }

  /** Rotação, redução de escala e desaparecimento. */
  playDeath(): void {
    if (this.dead) {
      return;
    }
    this.dead = true;
    this.healthBar.clear();
    this.statusMarks.clear();
    this.scene.tweens.add({
      targets: this.root,
      rotation: 1.6,
      scale: 0,
      alpha: 0,
      duration: 420,
      ease: 'Back.easeIn',
      onComplete: () => this.root.destroy(),
    });
  }

  destroy(): void {
    this.dead = true;
    this.root.destroy();
  }

  private applyPerspective(): void {
    this.perspectiveScale = this.perspectiveScaleAt(this.root.y);
    this.body.setScale(this.perspectiveScale);
    this.shadow.setScale(this.perspectiveScale);
    this.selectionRing.setScale(this.perspectiveScale);
    this.nameLabel.setScale(this.perspectiveScale);
    this.starLabel.setScale(this.perspectiveScale);
    this.healthBar.setScale(this.perspectiveScale);
    this.healthBar.setPosition(0, -this.bodyHeight * this.perspectiveScale - 10);
    this.statusMarks.setScale(this.perspectiveScale);
    this.statusMarks.setPosition(0, -this.bodyHeight * this.perspectiveScale - 20);
  }

  private setHealthRatio(healthRatio: number): void {
    this.healthRatio = Math.min(Math.max(healthRatio, 0), 1);
    this.drawHealthBar();
  }

  private restoreTint(): void {
    this.sprite.clearTint();
    if (!this.hasCustomSprite) {
      this.sprite.setTint(this.color);
    }
  }

  /** Barra com origem no centro-esquerda do próprio gráfico; a posição vertical é ajustada pela perspectiva. */
  private drawHealthBar(): void {
    this.healthBar.clear();
    if (!this.showHealthBar) {
      return;
    }
    const barHeight = bySize(HEALTH_BAR_HEIGHT, COMPACT_HEALTH_BAR_HEIGHT);
    this.healthBar.fillStyle(0x000000, 0.6);
    this.healthBar.fillRect(-HEALTH_BAR_WIDTH / 2 - 1, -1, HEALTH_BAR_WIDTH + 2, barHeight + 2);
    this.healthBar.fillStyle(this.healthRatio > 0.35 ? 0x4ade80 : 0xef4444, 1);
    this.healthBar.fillRect(-HEALTH_BAR_WIDTH / 2, 0, HEALTH_BAR_WIDTH * this.healthRatio, barHeight);
  }

  /** Uma marca colorida por estado ativo, em fila centralizada acima da barra de vida. */
  private drawStatusMarks(): void {
    this.statusMarks.clear();
    const statuses = [...this.activeStatuses];
    const spacing = STATUS_MARK_SIZE + 3;
    const firstX = (-(statuses.length - 1) * spacing) / 2;
    statuses.forEach((status, position) => {
      this.statusMarks.fillStyle(STATUS_COLORS[status], 1);
      this.statusMarks.fillCircle(firstX + position * spacing, 0, STATUS_MARK_SIZE / 2);
      this.statusMarks.lineStyle(1, 0x000000, 0.7);
      this.statusMarks.strokeCircle(firstX + position * spacing, 0, STATUS_MARK_SIZE / 2);
    });
  }
}
