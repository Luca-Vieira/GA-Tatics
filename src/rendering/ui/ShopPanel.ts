import Phaser from 'phaser';
import type { Rarity } from '@data/schemas/character';
import { bySize, isCompactDisplay } from '../layout/displayProfile';
import { SHOP_AREA, SHOP_SIDE, type Rectangle } from '../layout/gameLayout';
import { Button } from './Button';
import { CardPressGesture, type CardPressHandlers } from './cardPressGesture';
import { setFittedText } from './fittedText';
import { addPanelBackground, addText, colorToCss, COLORS, RARITY_COLORS, RARITY_LABELS, setTextColor, TEXT_COLORS, UI_DEPTH } from './theme';

const CARD_HEIGHT = 74;
const FREEZE_GAP = 4;
const FREEZE_HEIGHT = SHOP_AREA.height - CARD_HEIGHT - FREEZE_GAP;
const CARD_GAP = 8;
const MAXIMUM_CARD_WIDTH = 196;
const FROZEN_COLOR = 0x7dd3fc;
const COINS_HEIGHT = 42;

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
  /** Fora da preparação a loja fica fechada: no lugar das ofertas antigas aparece este aviso. */
  readonly closedMessage?: string;
}

export interface ShopPanelCallbacks {
  readonly onBuy: (slotIndex: number) => void;
  readonly onRefresh: () => void;
  readonly onToggleFreeze: (slotIndex: number) => void;
  /** Mouse sobre uma carta (`null` ao sair): usado para mostrar os detalhes do personagem. */
  readonly onHover: (characterId: string | null) => void;
  /** Toque longo (ou clique segurado) numa carta: mostra os detalhes sem comprar. */
  readonly onInspect: (characterId: string) => void;
}

class ShopCard {
  private readonly items: Phaser.GameObjects.GameObject[] = [];
  private readonly offerItems: (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible)[];
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
  private readonly press: CardPressGesture;
  private currentCharacterId: string | null = null;
  private renderedKey = '';

  constructor(scene: Phaser.Scene, x: number, private readonly width: number, slotIndex: number, callbacks: ShopPanelCallbacks) {
    const y = SHOP_AREA.y;
    const freezeY = y + CARD_HEIGHT + FREEZE_GAP;
    const track = <Item extends Phaser.GameObjects.GameObject>(item: Item): Item => {
      this.items.push(item);
      return item;
    };
    const text = (textX: number, textY: number, style: Phaser.Types.GameObjects.Text.TextStyle) => track(addText(scene, textX, textY, '', style).setDepth(UI_DEPTH + 1));

    this.background = track(scene.add.rectangle(x, y, width, CARD_HEIGHT, COLORS.slot).setOrigin(0, 0).setStrokeStyle(2, COLORS.slotBorder).setDepth(UI_DEPTH)).setInteractive({ useHandCursor: true });
    this.stripe = track(scene.add.rectangle(x, y, width, 5, 0xffffff).setOrigin(0, 0).setDepth(UI_DEPTH + 1));
    this.nameText = text(x + 8, y + 8, { fontSize: bySize('16px', '26px'), fontStyle: 'bold' });
    this.detailText = text(x + 8, y + 28, { fontSize: '11px', color: TEXT_COLORS.muted });
    this.synergyDot = track(scene.add.rectangle(x + 8, y + bySize(50, 55), bySize(9, 13), bySize(9, 13), 0xffffff).setOrigin(0, 0.5).setDepth(UI_DEPTH + 1));
    this.synergyText = text(x + bySize(22, 26), y + bySize(43, 44), { fontSize: bySize('12px', '19px'), fontStyle: 'bold' });
    this.abilityText = text(x + 8, y + 58, { fontSize: '11px', color: TEXT_COLORS.muted });
    this.costText = text(x + width - 8, y + CARD_HEIGHT - 3, { fontSize: bySize('18px', '28px'), fontStyle: 'bold' }).setOrigin(1, 1);
    this.fusionText = text(x + width - 8, y + 8, { fontSize: bySize('12px', '19px'), color: TEXT_COLORS.good, fontStyle: 'bold' }).setOrigin(1, 0);
    this.fusionText.setText(bySize('Fusão!', '★+'));
    this.soldText = text(x + width / 2, y + CARD_HEIGHT / 2, { fontSize: bySize('14px', '22px'), color: TEXT_COLORS.muted }).setOrigin(0.5);
    this.soldText.setText('Comprado');
    this.freezeButton = track(scene.add.rectangle(x, freezeY, width, FREEZE_HEIGHT, COLORS.button).setOrigin(0, 0).setStrokeStyle(1, 0xffffff, 0.3).setDepth(UI_DEPTH + 2)).setInteractive({ useHandCursor: true });
    this.freezeText = text(x + width / 2, freezeY + FREEZE_HEIGHT / 2, { fontSize: bySize('13px', '20px'), fontStyle: 'bold' }).setOrigin(0.5).setDepth(UI_DEPTH + 3);
    this.offerItems = [this.stripe, this.synergyDot, this.nameText, this.detailText, this.synergyText, this.abilityText, this.costText, this.freezeButton, this.freezeText];

    this.freezeButton.on('pointerdown', () => callbacks.onToggleFreeze(slotIndex));
    this.press = new CardPressGesture(scene, this.background, this.pressHandlers(slotIndex, callbacks));
  }

  private pressHandlers(slotIndex: number, callbacks: ShopPanelCallbacks): CardPressHandlers {
    return {
      onTap: () => callbacks.onBuy(slotIndex),
      onHold: () => {
        if (this.currentCharacterId) {
          callbacks.onInspect(this.currentCharacterId);
        }
      },
      onHover: (isHovering) => callbacks.onHover(isHovering ? this.currentCharacterId : null),
    };
  }

  get center(): { x: number; y: number } {
    return { x: this.background.x + this.width / 2, y: this.background.y + CARD_HEIGHT / 2 };
  }

  render(model: ShopCardModel | null, isClosed: boolean): void {
    const key = JSON.stringify([model, isClosed]);
    if (key === this.renderedKey) {
      return;
    }
    this.renderedKey = key;
    const offer = isClosed ? null : model;
    this.currentCharacterId = offer?.characterId ?? null;
    this.offerItems.forEach((item) => item.setVisible(offer !== null));
    // No modo compacto a carta mostra só nome, sinergia e preço; o resto aparece ao segurar.
    if (isCompactDisplay()) {
      [this.detailText, this.abilityText].forEach((item) => item.setVisible(false));
    }
    this.fusionText.setVisible(offer?.advancesFusion === true);
    this.soldText.setVisible(offer === null && !isClosed);
    this.background.setAlpha(offer ? 1 : 0.45);
    this.setFreezeEnabled(offer !== null);
    if (!offer) {
      this.press.cancel();
      this.background.setStrokeStyle(2, COLORS.slotBorder).setFillStyle(COLORS.slot);
      return;
    }
    this.renderOffer(offer);
  }

  /** Esconde a carta inteira (quem só assiste não tem loja). */
  setShown(isShown: boolean): void {
    this.renderedKey = '';
    if (isShown) {
      this.background.setVisible(true).setInteractive({ useHandCursor: true });
      return;
    }
    this.background.setVisible(false).disableInteractive();
    [...this.offerItems, this.fusionText, this.soldText].forEach((item) => item.setVisible(false));
    this.setFreezeEnabled(false);
  }

  destroy(): void {
    this.press.destroy();
    this.items.forEach((item) => item.destroy());
  }

  private setFreezeEnabled(isEnabled: boolean): void {
    if (isEnabled) {
      this.freezeButton.setInteractive({ useHandCursor: true });
    } else {
      this.freezeButton.disableInteractive();
    }
  }

  private renderOffer(offer: ShopCardModel): void {
    this.stripe.setFillStyle(RARITY_COLORS[offer.rarity]);
    this.background.setStrokeStyle(offer.isFrozen ? 4 : 2, offer.isFrozen ? FROZEN_COLOR : RARITY_COLORS[offer.rarity], offer.canAfford || offer.isFrozen ? 1 : 0.4);
    this.background.setFillStyle(offer.isFrozen ? 0x12304a : COLORS.slot);
    this.freezeButton.setFillStyle(offer.isFrozen ? 0x0284c7 : COLORS.button);
    this.freezeText.setText(offer.isFrozen ? '❄ Congelada' : 'Congelar');
    setFittedText(this.nameText, offer.name, this.width - (offer.advancesFusion ? bySize(62, 56) : 14));
    this.nameText.setAlpha(offer.canAfford ? 1 : 0.6);
    setFittedText(this.detailText, `${offer.archetype} · ${RARITY_LABELS[offer.rarity]}`, this.width - 14);
    this.synergyDot.setFillStyle(offer.synergyColor);
    this.synergyText.setText(offer.synergyName);
    setTextColor(this.synergyText, colorToCss(offer.synergyColor));
    setFittedText(this.abilityText, offer.abilityName, this.width - 54);
    this.costText.setText(`● ${offer.cost}`);
    setTextColor(this.costText, offer.canAfford ? TEXT_COLORS.gold : TEXT_COLORS.bad);
  }
}

/** Loja: cartas das ofertas (a quantidade vem da configuração), contador de moedas e botão de atualizar. */
export class ShopPanel {
  private readonly cards: ShopCard[];
  private readonly panels: Phaser.GameObjects.Rectangle[];
  private readonly coinsText: Phaser.GameObjects.Text;
  private readonly closedText: Phaser.GameObjects.Text;
  private readonly refreshButton: Button;

  constructor(scene: Phaser.Scene, cardCount: number, callbacks: ShopPanelCallbacks) {
    const count = Math.max(1, cardCount);
    const cardWidth = Math.min(MAXIMUM_CARD_WIDTH, Math.floor((SHOP_AREA.width - (count - 1) * CARD_GAP) / count));
    const rowWidth = count * cardWidth + (count - 1) * CARD_GAP;
    const firstX = SHOP_AREA.x + (SHOP_AREA.width - rowWidth) / 2;
    this.panels = [addPanelBackground(scene, SHOP_AREA.x - 6, SHOP_AREA.y - 4, SHOP_AREA.width + 12, SHOP_AREA.height + 8)];
    this.cards = Array.from({ length: count }, (_, slot) => new ShopCard(scene, firstX + slot * (cardWidth + CARD_GAP), cardWidth, slot, callbacks));
    this.closedText = addText(scene, SHOP_AREA.x + SHOP_AREA.width / 2, SHOP_AREA.y + CARD_HEIGHT / 2, '', { fontSize: bySize('18px', '27px'), fontStyle: 'bold', color: TEXT_COLORS.muted, stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH + 4);
    this.coinsText = addText(scene, SHOP_SIDE.x + SHOP_SIDE.width / 2, SHOP_SIDE.y, '', { fontSize: bySize('30px', '38px'), color: TEXT_COLORS.gold, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(UI_DEPTH);
    this.refreshButton = new Button(scene, { x: SHOP_SIDE.x, y: SHOP_SIDE.y + COINS_HEIGHT, width: SHOP_SIDE.width, height: SHOP_SIDE.height - COINS_HEIGHT, label: '', onClick: callbacks.onRefresh, fontSize: bySize(16, 28) });
  }

  /** Retângulo da loja na tela; soltar uma unidade aqui a vende. */
  get bounds(): Rectangle {
    return SHOP_AREA;
  }

  cardCenter(slotIndex: number): { x: number; y: number } {
    return this.cards[slotIndex]?.center ?? { x: SHOP_AREA.x, y: SHOP_AREA.y };
  }

  render(model: ShopViewModel): void {
    const isClosed = model.closedMessage !== undefined;
    this.cards.forEach((card, slot) => card.render(model.cards[slot] ?? null, isClosed));
    this.closedText.setText(model.closedMessage ?? '');
    this.coinsText.setText(`● ${model.coins}`);
    this.refreshButton.setLabel(`${bySize('Atualizar', '↻')}  ● ${model.refreshCost}`);
    this.refreshButton.setEnabled(!isClosed && model.coins >= model.refreshCost);
  }

  setVisible(isVisible: boolean): void {
    if (!isVisible) {
      this.render({ cards: [], coins: 0, refreshCost: 0, closedMessage: '' });
    }
    [...this.panels, this.coinsText, this.closedText].forEach((item) => item.setVisible(isVisible));
    this.cards.forEach((card) => card.setShown(isVisible));
    this.refreshButton.setVisible(isVisible);
  }

  destroy(): void {
    this.cards.forEach((card) => card.destroy());
    [...this.panels, this.coinsText, this.closedText].forEach((item) => item.destroy());
    this.refreshButton.destroy();
  }
}
