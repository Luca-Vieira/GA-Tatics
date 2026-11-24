import Phaser from 'phaser';
import type { HumanDuel, MatchSession, MatchView, RoundResultSummary, SessionListener } from '@core/game/MatchSession';
import { isAlive, type OwnedUnit, type PlayerState, type UnitLocation } from '@core/players/playerState';
import { sellValueOf } from '@core/shop/shop';
import { isTowerId } from '@core/tower/tower';
import { createBoardProjection, type BoardProjection } from '@shared/utils/boardProjection';
import type { Point } from '@shared/utils/hex';
import { drawBoard } from '../board/boardLayout';
import { CombatPlayback } from '../combat/CombatPlayback';
import { ensureUnitBodyTexture } from '../sprites/unitTexture';
import { appearanceOfSource, spriteTextureKey, type SpriteAppearance } from '../sprites/spriteRegistry';
import { Button } from '../ui/Button';
import { InfoPanel } from '../ui/InfoPanel';
import { ScreenOverlay } from '../ui/ScreenOverlay';
import { ShopPanel } from '../ui/ShopPanel';
import { SynergyPanel } from '../ui/SynergyPanel';
import { TopBar } from '../ui/TopBar';
import { COLORS, TEXT_COLORS, UI_DEPTH, addPanelBackground, addText } from '../ui/theme';
import {
  FAILURE_MESSAGES,
  buildEndScreen,
  buildInfoModel,
  buildRoundResultScreen,
  buildShopModel,
  buildSynergyModel,
  buildTopBarModel,
} from '../viewModels/viewModels';
import { PreparationView, type BenchSlotLayout, type UnitAppearance } from './PreparationView';

const SCREEN_WIDTH = 1280;
const SCREEN_HEIGHT = 720;
const BOARD_CENTER: Point = { x: 640, y: 288 };
const BOARD_HEX_SIZE = 48;

const BENCH_SLOT_WIDTH = 88;
const BENCH_SLOT_HEIGHT = 108;
const BENCH_SLOT_CENTERS: readonly Point[] = [
  { x: 70, y: 616 },
  { x: 168, y: 616 },
  { x: 266, y: 616 },
];
const SHOP_ORIGIN: Point = { x: 342, y: 552 };

const COMBAT_SPEEDS = [1, 2, 4] as const;
/** Depois do último golpe, a apresentação espera as animações de morte terminarem. */
const COMBAT_SETTLE_MS = 1400;
const RESTING_WAIT_MS = 2500;
const UI_REFRESH_INTERVAL_MS = 250;
const TOAST_DURATION_MS = 1800;
/** As regras da sala ficam um pouco mais na tela, para dar tempo de ler. */
const ROOM_RULES_TOAST_MS = 6000;

/** `waiting`: o resultado já foi fechado e a próxima rodada ainda não começou (só acontece em rede). */
type Stage = 'preparation' | 'combat' | 'resting' | 'result' | 'waiting' | 'ended';

/** O que a cena precisa para rodar: a sessão que conduz a partida e o que fazer quando o jogador pede outra. */
export interface GameSceneData {
  readonly session: MatchSession;
  /** Devolve a sessão de uma nova partida para jogar nesta mesma cena, ou `null` se o jogador foi levado a outra tela. */
  readonly playAgain: (scene: Phaser.Scene) => MatchSession | null;
  readonly endButtonLabel: string;
}

/**
 * Partida completa: preparação (loja, reserva, posicionamento, sinergias), combate animado, resultado da rodada e
 * fim de partida. As regras e os cronômetros vivem na sessão (local contra bots ou remota, em rede);
 * esta cena apresenta o que a sessão informa e repassa os gestos do jogador.
 */
export class GameScene extends Phaser.Scene {
  private projection!: BoardProjection;
  private sceneData!: GameSceneData;
  private session!: MatchSession;
  private preparation!: PreparationView;
  private topBar!: TopBar;
  private shopPanel!: ShopPanel;
  /** Criado a cada partida: a quantidade de linhas depende de quantas sinergias o conteúdo do jogo tem. */
  private synergyPanel: SynergyPanel | null = null;
  private infoPanel!: InfoPanel;
  private overlay!: ScreenOverlay;
  private readyButton!: Button;
  private unitCountText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private benchLabel!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private sellHintText!: Phaser.GameObjects.Text;

  private stage: Stage = 'preparation';
  private stageTimerMs = 0;
  private playback: CombatPlayback | null = null;
  private pendingSummary: RoundResultSummary | null = null;
  private roundSummary: RoundResultSummary | null = null;
  private isPresentationDone = false;
  private isMatchOver = false;
  private combatSettleMs = 0;
  private speedIndex = 0;
  private hoveredCharacterId: string | null = null;
  private refreshTimerMs = 0;
  private toastTween: Phaser.Tweens.Tween | null = null;
  private spriteByCharacter = new Map<string, SpriteAppearance>();

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData): void {
    this.sceneData = data;
  }

  /** Baixa do servidor os sprites dos personagens; os que falharem (ou não existirem) ficam com o desenho provisório. */
  preload(): void {
    this.load.crossOrigin = 'anonymous';
    for (const source of this.sceneData.session.spriteSources) {
      const key = spriteTextureKey(source.url);
      if (!this.textures.exists(key)) {
        this.load.image(key, source.url);
      }
    }
  }

  create(): void {
    ensureUnitBodyTexture(this);
    this.projection = createBoardProjection(BOARD_CENTER, { hexSize: BOARD_HEX_SIZE });
    drawBoard(this.add.graphics(), this.projection);
    this.createInterface();
    this.input.keyboard?.on('keydown-SPACE', () => this.toggleReady());
    this.input.keyboard?.on('keydown-S', () => this.cycleCombatSpeed());
    this.beginSession(this.sceneData.session);
  }

  override update(_time: number, deltaMs: number): void {
    this.session.update(deltaMs);
    switch (this.stage) {
      case 'combat':
        this.updateCombat(deltaMs);
        break;
      case 'resting':
        this.stageTimerMs -= deltaMs;
        if (this.stageTimerMs <= 0) {
          this.finishPresentation();
        }
        break;
      case 'result':
        this.updateResult(deltaMs);
        break;
      case 'preparation':
      case 'waiting':
      case 'ended':
        break;
    }
    this.preparation.update(this.time.now);
    this.refreshTimerMs -= deltaMs;
    if (this.refreshTimerMs <= 0) {
      this.refreshInterface();
    }
  }

  // --- Montagem da interface ----------------------------------------------------------------------

  private createInterface(): void {
    this.topBar = new TopBar(this, SCREEN_WIDTH, 4);
    this.infoPanel = new InfoPanel(this, 964, 70, 300, 462, () => this.sellSelectedUnit());

    this.shopPanel = new ShopPanel(this, SHOP_ORIGIN.x, SHOP_ORIGIN.y, 3, {
      onBuy: (slot) => this.buy(slot),
      onRefresh: () => this.refreshShop(),
      onToggleFreeze: (slot) => this.toggleFreeze(slot),
      onHover: (characterId) => {
        this.hoveredCharacterId = characterId;
        this.refreshInterface();
      },
    });

    this.benchLabel = addText(this, 24, 540, 'Reserva', { fontSize: '14px', fontStyle: 'bold', color: TEXT_COLORS.muted }).setDepth(UI_DEPTH);
    this.unitCountText = addText(this, BOARD_CENTER.x, 486, '', { fontSize: '14px', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(UI_DEPTH);
    this.speedText = addText(this, BOARD_CENTER.x, 486, '', { fontSize: '14px', color: TEXT_COLORS.muted }).setOrigin(0.5, 0).setDepth(UI_DEPTH);
    this.toastText = addText(this, BOARD_CENTER.x, 512, '', { fontSize: '17px', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(UI_DEPTH + 5).setAlpha(0);
    this.sellHintText = addText(this, SHOP_ORIGIN.x + 247, SHOP_ORIGIN.y + 63, 'Solte aqui para vender', { fontSize: '20px', fontStyle: 'bold', color: TEXT_COLORS.bad, stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(UI_DEPTH + 6)
      .setVisible(false);

    addPanelBackground(this, 1040 - 12, 566, 234, 108);
    this.readyButton = new Button(this, { x: 1040, y: 582, width: 210, height: 76, label: 'Pronto', onClick: () => this.toggleReady(), color: COLORS.go, hoverColor: COLORS.goHover, fontSize: 24 });
    this.overlay = new ScreenOverlay(this, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  private createPreparationView(): PreparationView {
    const benchSlots: BenchSlotLayout[] = BENCH_SLOT_CENTERS.map((center) => ({ center, width: BENCH_SLOT_WIDTH, height: BENCH_SLOT_HEIGHT }));
    const shopBounds = this.shopPanel.bounds;
    return new PreparationView(this, {
      projection: this.projection,
      benchSlots,
      sellArea: { x: shopBounds.x - 8, y: shopBounds.y - 8, width: shopBounds.width + 16, height: shopBounds.height + 16 },
      unitAppearance: (unit) => this.appearanceOf(unit),
      callbacks: {
        onSelect: () => this.refreshInterface(),
        onDragChange: (isDragging) => this.sellHintText.setVisible(isDragging),
        onMove: (unitId, destination) => this.moveUnit(unitId, destination),
        onSell: (unitId) => this.sellUnit(unitId),
      },
    });
  }

  private appearanceOf(unit: OwnedUnit): UnitAppearance {
    const character = this.match.getCharacter(unit.characterId);
    const synergy = this.match.synergies.find((candidate) => candidate.id === this.match.synergyMapping[unit.characterId]);
    return {
      name: character.name,
      isRanged: character.stats.range > 1,
      // A torre não ataca: não mostra área de alcance.
      range: isTowerId(unit.characterId) ? 0 : character.stats.range,
      sprite: this.spriteByCharacter.get(unit.characterId),
      accentColor: Number.parseInt((synergy?.color ?? '#94a3b8').slice(1), 16),
    };
  }

  private get match(): MatchView {
    return this.session.match;
  }

  private get human(): PlayerState {
    return this.match.getPlayer(this.session.humanId);
  }

  // --- Partida ------------------------------------------------------------------------------------

  /** Passa a apresentar `session`: limpa o que restou de uma partida anterior e pede o início. */
  private beginSession(session: MatchSession): void {
    this.session?.dispose();
    this.session = session;
    this.synergyPanel?.destroy();
    this.synergyPanel = new SynergyPanel(this, 16, 70, 300, session.match.synergies.length);
    this.spriteByCharacter = new Map(
      session.spriteSources.filter((source) => this.textures.exists(spriteTextureKey(source.url))).map((source) => [source.characterId, appearanceOfSource(source)]),
    );
    this.overlay.hide();
    this.resetPresentation();
    this.preparation?.destroy();
    this.preparation = this.createPreparationView();
    this.isMatchOver = false;
    session.setListener(this.createSessionListener());
    session.start();
    if (session.roomRules.length > 0) {
      this.toast(`Regras da sala: ${session.roomRules.join(' · ')}`, TEXT_COLORS.gold, ROOM_RULES_TOAST_MS);
    }
  }

  private createSessionListener(): SessionListener {
    return {
      preparationStarted: () => this.beginPreparation(),
      combatStarted: (humanDuel) => this.startCombat(humanDuel),
      roundConcluded: (summary) => {
        this.pendingSummary = summary;
        this.showResultWhenReady();
      },
      matchEnded: () => {
        this.isMatchOver = true;
        if (this.stage === 'waiting') {
          this.showEndScreen();
        }
      },
      stateChanged: () => {
        if (this.stage !== 'combat' && this.stage !== 'resting') {
          this.preparation.sync(this.human);
        }
        this.refreshInterface();
      },
      actionFailed: (reason) => this.toast(FAILURE_MESSAGES[reason], TEXT_COLORS.bad),
      fusionHappened: (message) => this.toast(message, TEXT_COLORS.gold),
      connectionLost: () => this.showConnectionLost(),
    };
  }

  /** Para a animação, os efeitos e os cronômetros da cena (a sessão tem os seus). */
  private resetPresentation(): void {
    this.playback?.destroy();
    this.playback = null;
    this.tweens.killAll();
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
    this.speedIndex = 0;
    this.pendingSummary = null;
    this.roundSummary = null;
    this.isPresentationDone = false;
    this.combatSettleMs = 0;
  }

  private beginPreparation(): void {
    // Vale também quando o servidor começa a rodada com a cena ainda no resultado ou no combate.
    this.overlay.hide();
    this.resetPresentation();
    this.stage = 'preparation';
    this.preparation.setVisible(true);
    this.preparation.setEnabled(true);
    this.preparation.select(null);
    this.preparation.sync(this.human);
    this.refreshInterface();
  }

  private startCombat(humanDuel: HumanDuel | null): void {
    this.resetPresentation();
    this.preparation.setEnabled(false);
    this.preparation.setVisible(false);
    this.preparation.select(null);
    this.hoveredCharacterId = null;
    this.toastTween?.stop();
    this.toastText.setAlpha(0);

    if (humanDuel) {
      this.stage = 'combat';
      const isViewedFromSideA = humanDuel.topId === this.session.humanId;
      this.playback = new CombatPlayback(this, this.projection, humanDuel.combatConfig, {
        isViewedFromSideA,
        spriteOf: (characterId) => (characterId ? this.spriteByCharacter.get(characterId) : undefined),
      });
    } else {
      this.stage = 'resting';
      this.stageTimerMs = RESTING_WAIT_MS;
    }
    this.refreshInterface();
  }

  private get combatSpeed(): number {
    return COMBAT_SPEEDS[this.speedIndex] ?? 1;
  }

  private cycleCombatSpeed(): void {
    this.speedIndex = (this.speedIndex + 1) % COMBAT_SPEEDS.length;
    this.tweens.timeScale = this.combatSpeed;
    this.time.timeScale = this.combatSpeed;
    this.refreshInterface();
  }

  private updateCombat(deltaMs: number): void {
    const playback = this.playback;
    if (!playback) {
      return;
    }
    playback.update(deltaMs, this.combatSpeed);
    if (!playback.isFinished) {
      return;
    }
    this.combatSettleMs += deltaMs * this.combatSpeed;
    if (this.combatSettleMs >= COMBAT_SETTLE_MS) {
      this.finishPresentation();
    }
  }

  /** A animação (ou a espera do descanso) acabou; o resultado aparece assim que a sessão o tiver (a local o dá na hora). */
  private finishPresentation(): void {
    if (this.isPresentationDone) {
      return;
    }
    this.isPresentationDone = true;
    this.session.presentationFinished();
    this.showResultWhenReady();
  }

  private showResultWhenReady(): void {
    const isShowingCombat = this.stage === 'combat' || this.stage === 'resting';
    if (!isShowingCombat || !this.isPresentationDone || !this.pendingSummary) {
      return;
    }
    const summary = this.pendingSummary;
    this.resetPresentation();
    this.preparation.setVisible(true);

    this.roundSummary = summary;
    this.stage = 'result';
    this.stageTimerMs = this.match.config.rounds.resultSeconds * 1000;
    this.showRoundResult();
    this.preparation.sync(this.human);
    this.refreshInterface();
  }

  private showRoundResult(): void {
    if (!this.roundSummary) {
      return;
    }
    const model = buildRoundResultScreen(this.match, this.roundSummary, this.session.humanId, this.stageTimerMs / 1000);
    this.overlay.show(model, () => this.leaveResult());
  }

  private updateResult(deltaMs: number): void {
    this.stageTimerMs -= deltaMs;
    if (this.roundSummary) {
      this.overlay.update(buildRoundResultScreen(this.match, this.roundSummary, this.session.humanId, this.stageTimerMs / 1000));
    }
    if (this.stageTimerMs <= 0) {
      this.leaveResult();
    }
  }

  private leaveResult(): void {
    if (this.stage !== 'result') {
      return;
    }
    this.overlay.hide();
    this.stage = 'waiting';
    // Na sessão local isto já começa a próxima rodada (e a cena sai de `waiting` pelo aviso da sessão).
    this.session.continueAfterResult();
    if (this.stage === 'waiting' && this.isMatchOver) {
      this.showEndScreen();
    }
    this.refreshInterface();
  }

  private showEndScreen(): void {
    this.stage = 'ended';
    this.overlay.show({ ...buildEndScreen(this.match, this.session.humanId), buttonLabel: this.sceneData.endButtonLabel }, () => this.playAgain());
    this.refreshInterface();
  }

  private playAgain(): void {
    const nextSession = this.sceneData.playAgain(this);
    if (nextSession) {
      this.beginSession(nextSession);
    }
  }

  private showConnectionLost(): void {
    this.stage = 'ended';
    this.resetPresentation();
    this.preparation.setEnabled(false);
    this.overlay.show(
      { title: 'Conexão perdida', titleColor: TEXT_COLORS.bad, lines: ['A conexão com o servidor foi encerrada.'], buttonLabel: this.sceneData.endButtonLabel },
      () => this.playAgain(),
    );
  }

  // --- Ações do jogador ---------------------------------------------------------------------------

  private get canAct(): boolean {
    return this.stage === 'preparation';
  }

  private buy(slotIndex: number): void {
    if (this.canAct) {
      this.session.buy(slotIndex);
    }
  }

  private refreshShop(): void {
    if (this.canAct) {
      this.session.refreshShop();
    }
  }

  private toggleFreeze(slotIndex: number): void {
    if (this.canAct) {
      this.session.toggleFreeze(slotIndex);
    }
  }

  private moveUnit(unitId: string, destination: UnitLocation): void {
    if (this.canAct) {
      this.session.move(unitId, destination);
    }
  }

  private sellUnit(unitId: string): void {
    if (this.canAct) {
      this.session.sell(unitId);
    }
  }

  private sellSelectedUnit(): void {
    const selectedId = this.preparation.selectedId;
    if (selectedId) {
      this.sellUnit(selectedId);
    }
  }

  private toggleReady(): void {
    if (this.canAct) {
      this.session.setReady(!this.human.ready);
    }
  }

  private toast(message: string, color: string, durationMs = TOAST_DURATION_MS): void {
    this.toastTween?.stop();
    this.toastText.setText(message).setColor(color).setAlpha(1);
    this.toastTween = this.tweens.add({ targets: this.toastText, alpha: 0, delay: durationMs, duration: 400 });
  }

  // --- Atualização da interface -------------------------------------------------------------------

  private refreshInterface(): void {
    this.refreshTimerMs = UI_REFRESH_INTERVAL_MS;
    const isPreparing = this.stage === 'preparation';
    const human = this.human;
    const humanId = this.session.humanId;

    this.topBar.render(buildTopBarModel(this.match, humanId, this.timerLabel(), this.phaseLabel()));
    this.shopPanel.render(buildShopModel(this.match, humanId));
    this.synergyPanel?.render(buildSynergyModel(this.match, humanId, Date.now()));
    this.infoPanel.render(this.currentInfoModel());

    const boardCount = human.units.filter((unit) => unit.location.kind === 'board').length;
    const isFull = boardCount >= this.match.unitLimit;
    this.unitCountText.setText(`Unidades no tabuleiro: ${boardCount}/${this.match.unitLimit}`).setColor(isFull ? TEXT_COLORS.gold : TEXT_COLORS.main).setVisible(isPreparing);
    this.speedText.setText(`Velocidade ${this.combatSpeed}x  ·  [S] muda`).setVisible(this.stage === 'combat');
    this.benchLabel.setVisible(this.stage !== 'ended');

    this.readyButton.setEnabled(isPreparing && isAlive(human));
    this.readyButton.setLabel(human.ready && isPreparing ? 'Aguardando…' : 'Pronto');
  }

  private currentInfoModel() {
    const selectedId = this.preparation.selectedId;
    const selectedUnit = selectedId ? this.human.units.find((unit) => unit.id === selectedId) : undefined;
    if (this.hoveredCharacterId && !selectedUnit) {
      return buildInfoModel(this.match, this.hoveredCharacterId, null, null);
    }
    if (selectedUnit) {
      return buildInfoModel(this.match, selectedUnit.characterId, selectedUnit.starLevel, sellValueOf(this.match.config.shop, selectedUnit.starLevel));
    }
    return null;
  }

  private phaseLabel(): string {
    switch (this.stage) {
      case 'preparation': {
        if (!isAlive(this.human)) {
          return 'Preparação · você foi eliminado e acompanha a partida';
        }
        const opponentId = this.match.opponentOf(this.session.humanId);
        return opponentId ? `Preparação · próximo adversário: ${this.match.getPlayer(opponentId).name}` : 'Preparação · você descansa nesta rodada';
      }
      case 'combat':
        return 'Combate';
      case 'resting':
        return 'Descanso';
      case 'result':
        return 'Resultado';
      case 'waiting':
        return 'Aguardando a próxima rodada';
      case 'ended':
        return 'Fim de partida';
    }
  }

  private timerLabel(): string {
    return this.stage === 'preparation' ? String(Math.max(0, Math.ceil(this.session.preparationRemainingMs / 1000))) : '';
  }
}
