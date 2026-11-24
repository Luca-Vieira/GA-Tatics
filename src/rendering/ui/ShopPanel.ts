import Phaser from 'phaser';
import type { Rarity } from '@data/schemas/character';
import { Button } from './Button';
import { addPanelBackground, addText, colorToCss, COLORS, RARITY_COLORS, RARITY_LABELS, TEXT_COLORS, UI_DEPTH } from './theme';

export const SHOP_CARD_WIDTH = 158;
export const SHOP_CARD_HEIGHT = 126;
const CARD_GAP = 10;
const FREEZE_BUTTON_WIDTH = 58;
const FREEZE_BUTTON_HEIGHT = 20;
const FROZEN_COLOR = 0x7dd3fc;

export interface ShopCardModel {
  readonly characterId: string;
  readonly name: string;
  readonly archetype: string;
  readonly rarity: Rarity;
  readonly cost: number;
  readonly synergyName: string;
  readonly synergyColor: number;
  readonly abilityName: string;
  readonly canAfford: boolean;
  /** Já tem uma cópia: comprar avança uma fusão. */
  readonly advancesFusion: boolean;
  /** Oferta congelada: fica na loja quando ela é atualizada e na rodada seguinte. */
  readonly isFrozen: boolean;
}

export interface ShopViewModel {
  /** `null` = oferta já comprada. */
  readonly cards: readonly (ShopCardModel | null)[];
  readonly coins: number;
  readonly refreshCost: number;
}

export interface ShopPanelCallbacks {
  readonly onBuy: (slotIndex: number) => void;
  readonly onRefresh: () => void;
  readonly onToggleFreeze: (slotIndex: number) => void;
  /** Mouse sobre uma carta (`null` ao sair): usado para mostrar os detalhes do personagem. */
  readonly onHover: (characterId: string | null) => void;
}

class ShopCard {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly stripe: Phaser.GameObjects.Rectangle;
  private readonly synergyDot: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly detailText: Phaser.GameObjects.Text;
  private readonly synergyText: Phaser.GameObjects.Text;
  private readonly abilityText: Phaser.GameObjects.Text;
  private readonly costText: Phaser.GameObjects.Text;
  private readonly fusionText: Phaser.GameObjects.Text;
  private readonly soldText: Phaser.GameObjects.Text;
  private readonly freezeButton: Phaser.GameObjects.Rectangle;
  private readonly freezeText: Phaser.GameObjects.Text;
  private currentCharacterId: string | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    slotIndex: number,
    callbacks: ShopPanelCallbacks,
  ) {
    this.background = scene.add.rectangle(x, y, SHOP_CARD_WIDTH, SHOP_CARD_HEIGHT, COLORS.slot).setOrigin(0, 0).setStrokeStyle(2, COLORS.slotBorder).setDepth(UI_DEPTH);
    this.background.setInteractive({ useHandCursor: true });
    this.stripe = scene.add.rectangle(x, y, SHOP_CARD_WIDTH, 6, 0xffffff).setOrigin(0, 0).setDepth(UI_DEPTH + 1);
    this.nameText = addText(scene, x + 10, y + 14, '', { fontSize: '17px', fontStyle: 'bold' }).setDepth(UI_DEPTH + 1);
    this.detailText = addText(scene, x + 10, y + 36, '', { fontSize: '11px', color: TEXT_COLORS.muted }).setDepth(UI_DEPTH + 1);
    this.synergyDot = scene.add.rectangle(x + 10, y + 59, 10, 10, 0xffffff).setOrigin(0, 0.5).setDepth(UI_DEPTH + 1);
    this.synergyText = addText(scene, x + 26, y + 52, '', { fontSize: '12px', fontStyle: 'bold' }).setDepth(UI_DEPTH + 1);
    this.abilityText = addText(scene, x + 10, y + 74, '', { fontSize: '11px', color: TEXT_COLORS.muted, wordWrap: { width: SHOP_CARD_WIDTH - 20 } }).setDepth(UI_DEPTH + 1);
    this.costText = addText(scene, x + SHOP_CARD_WIDTH - 10, y + SHOP_CARD_HEIGHT - 8, '', { fontSize: '18px', fontStyle: 'bold' })
      .setOrigin(1, 1)
      .setDepth(UI_DEPTH + 1);
    this.fusionText = addText(scene, x + 10, y + SHOP_CARD_HEIGHT - 10, 'Fusão!', { fontSize: '12px', color: TEXT_COLORS.good, fontStyle: 'bold' })
      .setOrigin(0, 1)
      .setDepth(UI_DEPTH + 1);
    this.soldText = addText(scene, x + SHOP_CARD_WIDTH / 2, y + SHOP_CARD_HEIGHT / 2, 'Comprado', { fontSize: '14px', color: TEXT_COLORS.muted })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH + 1);

    const freezeX = x + (SHOP_CARD_WIDTH - FREEZE_BUTTON_WIDTH) / 2 + 2;
    const freezeY = y + SHOP_CARD_HEIGHT - FREEZE_BUTTON_HEIGHT - 6;
    this.freezeButton = scene.add
      .rectangle(freezeX, freezeY, FREEZE_BUTTON_WIDTH, FREEZE_BUTTON_HEIGHT, COLORS.button)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 0.3)
      .setDepth(UI_DEPTH + 2)
      .setInteractive({ useHandCursor: true });
    this.freezeText = addText(scene, freezeX + FREEZE_BUTTON_WIDTH / 2, freezeY + FREEZE_BUTTON_HEIGHT / 2, 'Congelar', { fontSize: '11px', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH + 3);
    this.freezeButton.on('pointerdown', () => callbacks.onToggleFreeze(slotIndex));
    this.freezeButton.on('pointerover', () => callbacks.onHover(this.currentCharacterId));
    this.freezeButton.on('pointerout', () => callbacks.onHover(null));

    this.background.on('pointerdown', () => callbacks.onBuy(slotIndex));
    this.background.on('pointerover', () => callbacks.onHover(this.currentCharacterId));
    this.background.on('pointerout', () => callbacks.onHover(null));
  }

  get center(): { x: number; y: number } {
    return { x: this.x + SHOP_CARD_WIDTH / 2, y: this.y + SHOP_CARD_HEIGHT / 2 };
  }

  render(model: ShopCardModel | null): void {
    this.currentCharacterId = model?.characterId ?? null;
    const hasOffer = model !== null;
    [this.stripe, this.synergyDot, this.nameText, this.detailText, this.synergyText, this.abilityText, this.costText].forEach((item) => item.setVisible(hasOffer));
    this.fusionText.setVisible(hasOffer && model.advancesFusion);
    this.soldText.setVisible(!hasOffer);
    this.freezeButton.setVisible(hasOffer);
    this.freezeText.setVisible(hasOffer);
    if (hasOffer) {
      this.freezeButton.setInteractive({ useHandCursor: true });
    } else {
      this.freezeButton.disableInteractive();
    }
    this.background.setAlpha(hasOffer ? 1 : 0.45);
    if (!hasOffer) {
      this.background.setStrokeStyle(2, COLORS.slotBorder).setFillStyle(COLORS.slot);
      return;
    }
    this.stripe.setFillStyle(RARITY_COLORS[model.rarity]);
    this.background.setStrokeStyle(model.isFrozen ? 4 : 2, model.isFrozen ? FROZEN_COLOR : RARITY_COLORS[model.rarity], model.canAfford || model.isFrozen ? 1 : 0.4);
    this.background.setFillStyle(model.isFrozen ? 0x12304a : COLORS.slot);
    this.freezeButton.setFillStyle(model.isFrozen ? 0x0284c7 : COLORS.button);
    this.freezeText.setText(model.isFrozen ? 'Congelada' : 'Congelar');
    this.nameText.setText(model.name);
    this.detailText.setText(`${model.archetype} · ${RARITY_LABELS[model.rarity]}`);
    this.synergyDot.setFillStyle(model.synergyColor);
    this.synergyText.setText(model.synergyName).setColor(colorToCss(model.synergyColor));
    this.abilityText.setText(model.abilityName);
    this.costText.setText(`● ${model.cost}`).setColor(model.canAfford ? TEXT_COLORS.gold : TEXT_COLORS.bad);
    this.nameText.setAlpha(model.canAfford ? 1 : 0.6);
  }
}

/** Loja: cartas das ofertas, contador de moedas e botão de atualizar. */
export class ShopPanel {
  private readonly cards: ShopCard[];
  private readonly coinsText: Phaser.GameObjects.Text;
  private readonly refreshButton: Button;
  private readonly area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

  constructor(scene: Phaser.Scene, x: number, y: number, cardCount: number, callbacks: ShopPanelCallbacks) {
    const width = cardCount * SHOP_CARD_WIDTH + (cardCount - 1) * CARD_GAP;
    this.area = { x, y, width, height: SHOP_CARD_HEIGHT };
    addPanelBackground(scene, x - 8, y - 8, width + 16, SHOP_CARD_HEIGHT + 16);
    this.cards = Array.from({ length: cardCount }, (_, slot) => new ShopCard(scene, x + slot * (SHOP_CARD_WIDTH + CARD_GAP), y, slot, callbacks));
    this.coinsText = addText(scene, x + width + 30, y + 4, '', { fontSize: '30px', color: TEXT_COLORS.gold, fontStyle: 'bold' }).setDepth(UI_DEPTH);
    this.refreshButton = new Button(scene, { x: x + width + 30, y: y + 52, width: 150, height: 44, label: '', onClick: callbacks.onRefresh, fontSize: 15 });
  }

  /** Retângulo da loja na tela; soltar uma unidade aqui a vende. */
  get bounds(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
    return this.area;
  }

  cardCenter(slotIndex: number): { x: number; y: number } {
    return this.cards[slotIndex]?.center ?? { x: this.area.x, y: this.area.y };
  }

  render(model: ShopViewModel): void {
    this.cards.forEach((card, slot) => card.render(model.cards[slot] ?? null));
    this.coinsText.setText(`● ${model.coins}`);
    this.refreshButton.setLabel(`Atualizar  ● ${model.refreshCost}`);
    this.refreshButton.setEnabled(model.coins >= model.refreshCost);
  }
}
