import Phaser from 'phaser';
import type { HumanDuel, MatchSession, MatchView, RoundResultSummary, SessionListener } from '@core/game/MatchSession';
import { isAlive, type OwnedUnit, type PlayerState, type UnitLocation } from '@core/players/playerState';
import { sellValueOf } from '@core/shop/shop';
import { isTowerId } from '@core/tower/tower';
import { attackOf } from '@data/schemas/attack';
import { createBoardProjection, type BoardProjection } from '@shared/utils/boardProjection';
import type { Point } from '@shared/utils/hex';
import { gameAudio, type SoundEffect } from '../audio';
import { drawBoard } from '../board/boardLayout';
import { CombatPlayback } from '../combat/CombatPlayback';
import { applyHiDpiCamera, pointerPosition } from '../display/hiDpiCamera';
import { BOARD_CENTER, BOARD_HEX_SIZE, benchSlotLayouts } from '../layout/gameLayout';
import { SessionSprites } from '../sprites/SessionSprites';
import { spriteIdOfCharacter, spriteIdOfCombatUnit } from '../sprites/spriteRegistry';
import { ensureUnitBodyTexture } from '../sprites/unitTexture';
import { InfoPanel, type InfoModel, type PanelSide } from '../ui/InfoPanel';
import { MatchControls, type MatchControlsState } from '../ui/MatchControls';
import { ScreenOverlay } from '../ui/ScreenOverlay';
import { ShopPanel, type ShopViewModel } from '../ui/ShopPanel';
import { SynergyPanel } from '../ui/SynergyPanel';
import { TopBar } from '../ui/TopBar';
import { COLORS, TEXT_COLORS } from '../ui/theme';
import {
  FAILURE_MESSAGES,
  buildCombatInfoModel,
  buildEndScreen,
  buildInfoModel,
  buildRoundResultScreen,
  buildShopModel,
  buildSynergyModel,
  buildTopBarModel,
} from '../viewModels/viewModels';
import { PreparationView, type UnitAppearance } from './PreparationView';

const COMBAT_SPEEDS = [1, 2, 4] as const;
/** Depois do último golpe, a apresentação espera as animações de morte terminarem. */
const COMBAT_SETTLE_MS = 900;
const RESTING_WAIT_MS = 2500;
const UI_REFRESH_INTERVAL_MS = 250;
const TOAST_DURATION_MS = 1800;
/** As regras da sala ficam um pouco mais na tela, para dar tempo de ler. */
const ROOM_RULES_TOAST_MS = 6000;
/** A confirmação de saída fica acima da tela de resultado. */
const CONFIRMATION_DEPTH_OFFSET = 100;

/** `waiting`: o resultado já foi fechado e a próxima rodada ainda não começou (só acontece em rede). */
type Stage = 'preparation' | 'combat' | 'resting' | 'result' | 'waiting' | 'ended';

/** O que a cena precisa para rodar: a sessão que conduz a partida e o que fazer quando o jogador pede outra. */
export interface GameSceneData {
  readonly session: MatchSession;
  /** Devolve a sessão de uma nova partida para jogar nesta mesma cena, ou `null` se o jogador foi levado a outra tela. */
  readonly playAgain: (scene: Phaser.Scene) => MatchSession | null;
  readonly endButtonLabel: string;
}

interface Inspection {
  readonly model: InfoModel;
  readonly side: PanelSide;
}

/** Abre o painel do lado oposto ao do personagem consultado, para não o cobrir. */
function panelSideFor(anchor: Point | null): PanelSide {
  return anchor === null || anchor.x < BOARD_CENTER.x ? 'right' : 'left';
}

/**
 * Partida completa: preparação (loja, reserva, posicionamento, sinergias), combate animado, resultado da rodada e
 * fim de partida. As regras e os cronômetros vivem na sessão (local contra bots ou remota, em rede);
 * esta cena apresenta o que a sessão informa e repassa os gestos do jogador. Quem só assiste vê a partida pela visão
 * do jogador escolhido no placar, sem loja nem ações.
 */
export class GameScene extends Phaser.Scene {
  private projection!: BoardProjection;
  private sceneData!: GameSceneData;
  private session!: MatchSession;
  private preparation!: PreparationView;
  private topBar!: TopBar;
  /** Loja e sinergias são criadas a cada partida: as quantidades vêm do conteúdo e da configuração. */
  private shopPanel: ShopPanel | null = null;
  private synergyPanel: SynergyPanel | null = null;
  private sprites: SessionSprites | null = null;
  private infoPanel!: InfoPanel;
  private controls!: MatchControls;
  private overlay!: ScreenOverlay;
  private leaveDialog!: ScreenOverlay;

  private stage: Stage = 'preparation';
  private stageTimerMs = 0;
  private playback: CombatPlayback | null = null;
  private pendingSummary: RoundResultSummary | null = null;
  private roundSummary: RoundResultSummary | null = null;
  private isPresentationDone = false;
  private isMatchOver = false;
  private combatSettleMs = 0;
  private speedIndex = 0;
  /** Carta sob o mouse e carta fixada por um toque longo. */
  private hoveredCharacterId: string | null = null;
  private inspectedCharacterId: string | null = null;
  /** Som que só toca se a sessão aceitar a ação pedida. */
  private pendingActionSound: SoundEffect | null = null;
  private refreshTimerMs = 0;

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData): void {
    this.sceneData = data;
  }

  create(): void {
    applyHiDpiCamera(this);
    ensureUnitBodyTexture(this);
    this.projection = createBoardProjection(BOARD_CENTER, { hexSize: BOARD_HEX_SIZE });
    drawBoard(this.add.graphics(), this.projection);
    // A cena é reaproveitada entre partidas: o que o Phaser destruiu ao sair não pode ser destruído de novo.
    this.shopPanel = null;
    this.synergyPanel = null;
    this.sprites = null;
    this.playback = null;
    this.createInterface();
    this.registerInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.closeSession());
    this.beginSession(this.sceneData.session, true);
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
    this.topBar = new TopBar(this, (playerId) => this.watchPlayer(playerId));
    this.infoPanel = new InfoPanel(this, { onSell: () => this.sellSelectedUnit(), onClose: () => this.closeInspection() });
    this.controls = new MatchControls(this, { onReady: () => this.toggleReady(), onLeave: () => this.askToLeave() });
    this.overlay = new ScreenOverlay(this);
    this.leaveDialog = new ScreenOverlay(this, { depthOffset: CONFIRMATION_DEPTH_OFFSET, buttonColor: COLORS.danger, buttonHoverColor: 0xef4444 });
  }

  private registerInput(): void {
    this.input.keyboard?.on('keydown-SPACE', () => this.toggleReady());
    this.input.keyboard?.on('keydown-S', () => this.cycleCombatSpeed());
    this.input.keyboard?.on('keydown-ESC', () => (this.leaveDialog.isVisible ? this.leaveDialog.hide() : this.askToLeave()));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => this.handleFreeTap(pointer, currentlyOver));
  }

  private createShopPanel(cardCount: number): ShopPanel {
    return new ShopPanel(this, cardCount, {
      onBuy: (slot) => this.buy(slot),
      onRefresh: () => this.refreshShop(),
      onToggleFreeze: (slot) => this.toggleFreeze(slot),
      onHover: (characterId) => {
        this.hoveredCharacterId = characterId;
        this.refreshInterface();
      },
      onInspect: (characterId) => {
        this.inspectedCharacterId = characterId;
        this.preparation.select(null);
      },
    });
  }

  private createPreparationView(): PreparationView {
    const shopBounds = this.shopPanel!.bounds;
    return new PreparationView(this, {
      projection: this.projection,
      benchSlots: benchSlotLayouts(this.match.config.rounds.benchSize),
      sellArea: { x: shopBounds.x - 8, y: shopBounds.y - 4, width: shopBounds.width + 16, height: shopBounds.height + 8 },
      unitAppearance: (unit) => this.appearanceOf(unit),
      isReadOnly: this.isSpectator,
      callbacks: {
        onSelect: (unitId) => {
          if (unitId !== null) {
            this.inspectedCharacterId = null;
          }
          this.refreshInterface();
        },
        onDragChange: (isDragging) => {
          this.controls.showSellHint(isDragging);
          this.refreshInterface();
        },
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
      isTower: isTowerId(unit.characterId),
      // A torre não ataca: não mostra área de ataque.
      range: isTowerId(unit.characterId) ? 0 : character.stats.range,
      attackShape: attackOf(character).shape,
      sprite: this.sprites?.appearanceOf(spriteIdOfCharacter(unit.characterId)),
      accentColor: Number.parseInt((synergy?.color ?? '#94a3b8').slice(1), 16),
    };
  }

  private get match(): MatchView {
    return this.session.match;
  }

  private get human(): PlayerState {
    return this.match.getPlayer(this.session.humanId);
  }

  private get isSpectator(): boolean {
    return this.session.spectator !== null;
  }

  // --- Partida ------------------------------------------------------------------------------------

  /** Passa a apresentar `session`: limpa o que restou de uma partida anterior e pede o início. */
  private beginSession(session: MatchSession, isFreshScene = false): void {
    if (!isFreshScene) {
      this.closeSession();
      this.preparation.destroy();
    }
    this.session = session;
    this.shopPanel = this.createShopPanel(session.match.config.shop.offerSize);
    this.shopPanel.setVisible(!this.isSpectator);
    this.synergyPanel = new SynergyPanel(this, session.match.synergies.length);
    this.sprites = new SessionSprites(this, session.spriteSources, () => this.handleSpritesArrived());
    this.sprites.load();
    this.overlay.hide();
    this.leaveDialog.hide();
    this.resetPresentation();
    this.preparation = this.createPreparationView();
    this.isMatchOver = false;
    session.setListener(this.createSessionListener());
    session.start();
    if (session.roomRules.length > 0) {
      this.toast(`Regras da sala: ${session.roomRules.join(' · ')}`, TEXT_COLORS.gold, ROOM_RULES_TOAST_MS);
    }
    this.refreshInterface();
  }

  private closeSession(): void {
    this.session?.dispose();
    this.sprites?.destroy();
    this.shopPanel?.destroy();
    this.synergyPanel?.destroy();
    this.sprites = null;
    this.shopPanel = null;
    this.synergyPanel = null;
  }

  private handleSpritesArrived(): void {
    this.preparation.rebuild(this.human);
    if (this.stage === 'combat' || this.stage === 'resting') {
      this.preparation.setVisible(false);
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
        this.playPendingActionSound();
        if (this.stage !== 'combat' && this.stage !== 'resting') {
          this.preparation.sync(this.human);
        }
        this.refreshInterface();
      },
      actionFailed: (reason) => {
        this.pendingActionSound = null;
        this.toast(FAILURE_MESSAGES[reason], TEXT_COLORS.bad);
      },
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
    this.controls.hideToast();
    this.controls.showSellHint(false);
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
    this.inspectedCharacterId = null;

    if (humanDuel) {
      this.stage = 'combat';
      this.playback = this.createPlayback(humanDuel);
    } else {
      this.stage = 'resting';
      this.stageTimerMs = RESTING_WAIT_MS;
    }
    this.refreshInterface();
  }

  private createPlayback(humanDuel: HumanDuel): CombatPlayback {
    const playback = new CombatPlayback(this, this.projection, humanDuel.combatConfig, {
      isViewedFromSideA: humanDuel.topId === this.session.humanId,
      spriteOf: (unit) => this.sprites?.appearanceOf(spriteIdOfCombatUnit(unit)),
      playSound: (effect) => gameAudio.play(effect),
    });
    if (humanDuel.elapsedMs !== undefined && humanDuel.elapsedMs > 0) {
      playback.skipTo(humanDuel.elapsedMs);
    }
    return playback;
  }

  private get combatSpeed(): number {
    return COMBAT_SPEEDS[this.speedIndex] ?? 1;
  }

  private cycleCombatSpeed(): void {
    if (this.stage !== 'combat') {
      return;
    }
    gameAudio.play('click');
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
    this.playResultSound(summary);
    this.showRoundResult();
    this.preparation.sync(this.human);
    this.refreshInterface();
  }

  private playResultSound(summary: RoundResultSummary): void {
    const humanId = this.session.humanId;
    const duel = this.isSpectator ? undefined : summary.duels.find((candidate) => candidate.topId === humanId || candidate.bottomId === humanId);
    if (duel?.winnerId === humanId) {
      gameAudio.play('round_win');
    } else if (duel?.loserId === humanId) {
      gameAudio.play('round_loss');
    }
  }

  private roundResultModel(summary: RoundResultSummary) {
    return buildRoundResultScreen(this.match, summary, this.session.humanId, this.stageTimerMs / 1000, { isSpectator: this.isSpectator });
  }

  private showRoundResult(): void {
    if (this.roundSummary) {
      this.overlay.show(this.roundResultModel(this.roundSummary), () => this.leaveResult());
    }
  }

  private updateResult(deltaMs: number): void {
    this.stageTimerMs -= deltaMs;
    if (this.roundSummary) {
      this.overlay.update(this.roundResultModel(this.roundSummary));
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
    this.leaveDialog.hide();
    const model = buildEndScreen(this.match, this.session.humanId, { isSpectator: this.isSpectator });
    this.overlay.show({ ...model, buttonLabel: this.sceneData.endButtonLabel }, () => this.playAgain());
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
    this.leaveDialog.hide();
    this.preparation.setEnabled(false);
    this.overlay.show(
      { title: 'Conexão perdida', titleColor: TEXT_COLORS.bad, lines: ['A conexão com o servidor foi encerrada.'], buttonLabel: this.sceneData.endButtonLabel },
      () => this.playAgain(),
    );
    this.refreshInterface();
  }

  // --- Sair e assistir ----------------------------------------------------------------------------

  private askToLeave(): void {
    if (this.stage === 'ended') {
      return;
    }
    gameAudio.play('click');
    this.leaveDialog.show(
      { title: 'Sair da partida?', titleColor: TEXT_COLORS.gold, lines: this.leaveWarningLines(), buttonLabel: 'Sair da partida', secondaryButtonLabel: 'Continuar aqui' },
      () => this.leaveMatch(),
      () => this.leaveDialog.hide(),
    );
  }

  private leaveWarningLines(): string[] {
    if (this.isSpectator) {
      return ['Você deixa de assistir a esta partida.'];
    }
    return ['Você abandona a partida e não poderá voltar a ela.', 'Contra bots ela é encerrada; em rede, um bot assume a sua vaga.'];
  }

  private leaveMatch(): void {
    this.leaveDialog.hide();
    this.session.leave();
    // Em rede, `playAgain` leva ao saguão (e devolve null). Na partida local ele cria outra partida, que é descartada.
    const unusedSession = this.sceneData.playAgain(this);
    if (unusedSession) {
      unusedSession.dispose();
      this.scene.start('LobbyScene');
    }
  }

  private watchPlayer(playerId: string): void {
    const spectator = this.session.spectator;
    if (!spectator || spectator.watchedPlayerId === playerId) {
      return;
    }
    gameAudio.play('click');
    this.closeInspection();
    // A sessão responde com os avisos de sempre (preparação ou combate) já na visão do escolhido.
    spectator.watch(playerId);
  }

  // --- Ações do jogador ---------------------------------------------------------------------------

  private get canAct(): boolean {
    return this.stage === 'preparation' && !this.isSpectator;
  }

  private perform(sound: SoundEffect, action: () => void): void {
    if (!this.canAct) {
      return;
    }
    this.pendingActionSound = sound;
    action();
  }

  private playPendingActionSound(): void {
    if (this.pendingActionSound !== null) {
      gameAudio.play(this.pendingActionSound);
      this.pendingActionSound = null;
    }
  }

  private buy(slotIndex: number): void {
    // A carta comprada some; os detalhes que o mouse abriu sobre ela não devem ficar.
    this.hoveredCharacterId = null;
    this.perform('purchase', () => this.session.buy(slotIndex));
  }

  private refreshShop(): void {
    this.perform('refresh', () => this.session.refreshShop());
  }

  private toggleFreeze(slotIndex: number): void {
    this.perform('click', () => this.session.toggleFreeze(slotIndex));
  }

  private moveUnit(unitId: string, destination: UnitLocation): void {
    this.perform('click', () => this.session.move(unitId, destination));
  }

  private sellUnit(unitId: string): void {
    this.perform('sell', () => this.session.sell(unitId));
  }

  private sellSelectedUnit(): void {
    const selectedId = this.preparation.selectedId;
    if (selectedId) {
      this.sellUnit(selectedId);
    }
  }

  private toggleReady(): void {
    if (this.canAct && isAlive(this.human)) {
      gameAudio.play('click');
      this.session.setReady(!this.human.ready);
    }
  }

  private toast(message: string, color: string, durationMs = TOAST_DURATION_MS): void {
    this.controls.toast(message, color, durationMs);
  }

  // --- Consulta de personagens --------------------------------------------------------------------

  /** Toque fora de botões e cartas: fecha o que estava fixado e, no combate, escolhe quem consultar. */
  private handleFreeTap(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
    if (currentlyOver.length > 0) {
      return;
    }
    this.inspectedCharacterId = null;
    this.hoveredCharacterId = null;
    this.synergyPanel?.closeDetails();
    if (this.stage === 'combat' && this.playback) {
      const unitId = this.playback.unitIdAt(pointerPosition(this, pointer));
      this.playback.select(unitId === this.playback.selectedId ? null : unitId);
    }
    this.refreshInterface();
  }

  private closeInspection(): void {
    this.inspectedCharacterId = null;
    this.hoveredCharacterId = null;
    this.playback?.select(null);
    this.preparation.select(null);
    this.refreshInterface();
  }

  private currentInspection(): Inspection | null {
    if (this.preparation.isDragging || this.stage === 'ended') {
      return null;
    }
    return this.combatInspection() ?? this.selectedUnitInspection() ?? this.cardInspection();
  }

  private combatInspection(): Inspection | null {
    const selected = this.playback?.inspectSelected();
    if (!selected) {
      return null;
    }
    const model = buildCombatInfoModel(this.match, selected.unit, selected.inspection, { teamLabel: this.teamLabelOf(selected.unit.side), nowMs: this.playback!.simulation.timeMs });
    return { model, side: panelSideFor(this.playback!.selectedGroundPosition()) };
  }

  /** O jogador assistido (ou o próprio) aparece sempre na metade esquerda. */
  private teamLabelOf(side: 'A' | 'B'): string {
    const isViewedFromSideA = this.playback?.isViewedFromSideA ?? false;
    const isOwnTeam = (side === 'A') === isViewedFromSideA;
    if (this.isSpectator) {
      return isOwnTeam ? `Equipe de ${this.human.name}` : 'Equipe adversária';
    }
    return isOwnTeam ? 'Sua equipe' : 'Adversário';
  }

  private selectedUnitInspection(): Inspection | null {
    const selectedId = this.preparation.selectedId;
    const unit = selectedId ? this.human.units.find((candidate) => candidate.id === selectedId) : undefined;
    if (!unit) {
      return null;
    }
    const sellValue = this.canAct ? sellValueOf(this.match.config.shop, unit.starLevel) : null;
    return { model: buildInfoModel(this.match, unit.characterId, unit.starLevel, sellValue), side: panelSideFor(this.preparation.groundPositionOf(unit.id)) };
  }

  private cardInspection(): Inspection | null {
    const characterId = this.inspectedCharacterId ?? this.hoveredCharacterId;
    return characterId ? { model: buildInfoModel(this.match, characterId, null, null), side: 'right' } : null;
  }

  // --- Atualização da interface -------------------------------------------------------------------

  private refreshInterface(): void {
    if (!this.shopPanel) {
      return;
    }
    this.refreshTimerMs = UI_REFRESH_INTERVAL_MS;
    const humanId = this.session.humanId;
    this.topBar.render(buildTopBarModel(this.match, humanId, this.timerLabel(), this.phaseLabel(), { isSpectator: this.isSpectator }));
    if (!this.isSpectator) {
      this.shopPanel.render(this.shopModel());
    }
    this.synergyPanel?.render(buildSynergyModel(this.match, humanId, Date.now()));
    this.controls.render(this.controlsState());
    this.renderInspection();
  }

  private renderInspection(): void {
    const inspection = this.currentInspection();
    if (inspection) {
      this.infoPanel.show(inspection.model, inspection.side);
    } else {
      this.infoPanel.hide();
    }
  }

  /** Fora da preparação a loja fica fechada: as ofertas novas só existem quando a próxima rodada começa. */
  private shopModel(): ShopViewModel {
    const model = buildShopModel(this.match, this.session.humanId);
    const closedMessage = this.shopClosedMessage();
    return closedMessage === null ? model : { ...model, closedMessage };
  }

  private shopClosedMessage(): string | null {
    switch (this.stage) {
      case 'preparation':
        return isAlive(this.human) ? null : 'Você foi eliminado';
      case 'combat':
      case 'resting':
        return 'Loja fechada durante o combate';
      case 'result':
      case 'waiting':
        return 'A loja abre na próxima rodada';
      case 'ended':
        return 'Partida encerrada';
    }
  }

  private controlsState(): MatchControlsState {
    const human = this.human;
    const stage = this.stage === 'preparation' || this.stage === 'combat' || this.stage === 'ended' ? this.stage : 'other';
    return {
      stage,
      isSpectator: this.isSpectator,
      canBeReady: isAlive(human),
      isReady: human.ready,
      speed: this.combatSpeed,
      boardCount: human.units.filter((unit) => unit.location.kind === 'board').length,
      unitLimit: this.match.unitLimit,
      watchedName: human.name,
    };
  }

  private phaseLabel(): string {
    if (this.isSpectator && this.stage !== 'ended') {
      return `Espectador · ${this.stage === 'preparation' ? 'preparação' : this.stage === 'combat' ? 'combate' : 'intervalo'}`;
    }
    switch (this.stage) {
      case 'preparation': {
        if (!isAlive(this.human)) {
          return 'Preparação · você foi eliminado';
        }
        const opponentId = this.match.opponentOf(this.session.humanId);
        return opponentId ? `Preparação · adversário: ${this.match.getPlayer(opponentId).name}` : 'Preparação · você descansa nesta rodada';
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
