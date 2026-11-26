import Phaser from 'phaser';
import { MAXIMUM_PLAYERS, MINIMUM_PLAYERS } from '@core/game/Game';
import { DEFAULT_LOCAL_PLAYER_COUNT, LocalMatchSession } from '@core/game/LocalMatchSession';
import { describeRoomModifiers } from '@core/game/roomModifiers';
import { rotationIndexAt, synergyMappingForIndex } from '@core/synergies/rotation';
import { DEFAULT_GAME_CONTENT } from '@data/defaults/content';
import { NO_ROOM_MODIFIERS, ROOM_MODIFIER_CHOICES, type RoomModifiers } from '@data/schemas/roomModifiers';
import { defaultSocketAddress } from '@shared/utils/serverAddress';
import { LobbyClient } from '@multiplayer/client/LobbyClient';
import type { RemoteMatchSession } from '@multiplayer/client/RemoteMatchSession';
import { ConnectionError, ServerConnection } from '@multiplayer/client/ServerConnection';
import { DEFAULT_PLAYERS_PER_ROOM, MAXIMUM_PLAYER_NAME_LENGTH, MAXIMUM_ROOM_PASSWORD_LENGTH } from '@multiplayer/protocol/clientMessages';
import type { RoomSummaryView, RoomVisibility } from '@multiplayer/protocol/serverMessages';
import { openCharacterGallery } from '@rendering/gallery';
import { showReloadNotice } from '../ui/reloadNotice';
import type { GameSceneData } from './GameScene';

export interface LobbySceneData {
  /** Presente quando o jogador volta ao saguão depois de uma partida em rede. */
  readonly client?: LobbyClient;
  /** Por que a pessoa foi trazida de volta (ex.: a sala foi encerrada); mostrado uma vez. */
  notice?: string;
}

type HubView = 'hub' | 'create';

/** De quanto em quanto tempo a lista de salas é pedida de novo enquanto o hub está aberto. */
const ROOM_LIST_REFRESH_MS = 3000;

/**
 * O saguão é HTML comum por cima do jogo (e não um elemento do Phaser): assim os campos e botões não encolhem junto
 * com a tela do jogo no celular e a página rola quando o painel não cabe.
 */
const OVERLAY_STYLE = [
  'position:fixed',
  'inset:0',
  'z-index:100',
  'display:flex',
  'overflow:auto',
  'overscroll-behavior:contain',
  'box-sizing:border-box',
  'padding:8px',
  'background:#0b1220',
].join(';');
const PANEL_BASE_STYLE = [
  'box-sizing:border-box',
  'margin:auto',
  'padding:clamp(14px,3vw,26px)',
  'background:#16213a',
  'border:2px solid #2f3e5c',
  'border-radius:8px',
  'color:#e5e7eb',
  'font-family:Arial,sans-serif',
  'font-size:15px',
  'display:flex',
  'flex-direction:column',
  'gap:10px',
].join(';');
/** Altura mínima de tudo o que se toca com o dedo. */
const TOUCH_TARGET_STYLE = 'min-height:44px;box-sizing:border-box;';
// Campos com letra de 16px ou mais não fazem o celular dar zoom sozinho ao tocar neles.
const INPUT_STYLE = `${TOUCH_TARGET_STYLE}width:100%;padding:9px 10px;border-radius:5px;border:1px solid #3b4d73;background:#0f1a30;color:#e5e7eb;font-size:16px;`;
const BUTTON_STYLE = `${TOUCH_TARGET_STYLE}padding:10px 14px;border:0;border-radius:5px;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;touch-action:manipulation;`;
const ROW_STYLE = 'display:flex;flex-wrap:wrap;gap:10px;';
const TAG_STYLE = 'display:inline-block;padding:2px 8px;border-radius:10px;background:#0f1a30;border:1px solid #3b4d73;font-size:12px;color:#fbbf24;margin:2px 4px 0 0;';
const LABEL_STYLE = 'display:flex;flex-direction:column;gap:4px;color:#94a3b8;font-size:13px;';

const PLAYER_COUNT_CHOICES: readonly number[] = Array.from({ length: MAXIMUM_PLAYERS - MINIMUM_PLAYERS + 1 }, (_, index) => MINIMUM_PLAYERS + index);

/** Rótulos e formato de cada regra especial de sala no formulário de criação. */
const MODIFIER_FIELDS: readonly { readonly key: keyof RoomModifiers; readonly label: string; readonly format: (value: number) => string }[] = [
  { key: 'extraLives', label: 'Vidas extras', format: (value) => (value === 0 ? 'Normal' : `+${value}`) },
  { key: 'extraPreparationSeconds', label: 'Mais tempo de preparação', format: (value) => (value === 0 ? 'Normal' : `+${value} s`) },
  { key: 'extraCombatSeconds', label: 'Mais tempo de combate', format: (value) => (value === 0 ? 'Normal' : `+${value} s`) },
  { key: 'extraIncome', label: 'Mais dinheiro por rodada', format: (value) => (value === 0 ? 'Normal' : `+${value}`) },
  { key: 'statBonusPercent', label: 'Mais status (vida e dano)', format: (value) => (value === 0 ? 'Normal' : `+${value}%`) },
];

function defaultServerAddress(): string {
  return defaultSocketAddress({ isDevelopment: import.meta.env.DEV, page: window.location, configuredUrl: import.meta.env.VITE_SERVER_URL });
}

/** Cria um elemento com estilo e texto (o texto nunca é lido como HTML, então nomes de jogadores não injetam nada). */
function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, style = '', text = ''): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  created.style.cssText = style;
  created.textContent = text;
  return created;
}

/**
 * Tela inicial e hub. Sem conexão: jogar contra bots no navegador ou conectar a um servidor. Conectado: partida rápida,
 * lista de salas públicas (para entrar ou assistir), entrar por código (com senha), criar sala (pública ou privada, com
 * senha, número de jogadores e regras especiais) e, dentro da sala, esperar o anfitrião iniciar. Das telas inicial e do
 * hub abre-se a consulta de personagens.
 */
export class LobbyScene extends Phaser.Scene {
  private client: LobbyClient | null = null;
  private overlay: HTMLElement | null = null;
  private closeGallery: (() => void) | null = null;
  private stopWatchingMatch: (() => void) | null = null;
  private readonly unsubscribers: (() => void)[] = [];
  private refreshTimer: number | null = null;
  private roomListContainer: HTMLElement | null = null;

  private playerName = '';
  private serverAddress = defaultServerAddress();
  private roomCode = '';
  private roomPassword = '';
  private message = '';
  private isBusy = false;
  private isShown = false;
  private hubView: HubView = 'hub';
  private newRoomVisibility: RoomVisibility = 'public';
  private newRoomPassword = '';
  private newRoomModifiers: RoomModifiers = NO_ROOM_MODIFIERS;
  private newRoomPlayerCount = DEFAULT_PLAYERS_PER_ROOM;
  private localPlayerCount = DEFAULT_LOCAL_PLAYER_COUNT;

  constructor() {
    super('LobbyScene');
  }

  init(data: LobbySceneData): void {
    this.stopWatchingMatch?.();
    this.stopWatchingMatch = null;
    // A cena é a mesma a cada volta: se a conexão continua aberta, ela é mantida mesmo sem vir nos dados.
    const knownClient = data.client ?? this.client;
    this.client = knownClient?.isConnected ? knownClient : null;
    this.message = data.notice ?? '';
    // O Phaser guarda os dados da última abertura; o aviso não pode reaparecer na próxima.
    data.notice = undefined;
    this.isBusy = false;
    this.hubView = 'hub';
  }

  create(): void {
    this.isShown = true;
    this.overlay = element('div', OVERLAY_STYLE);
    document.body.append(this.overlay);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tearDown());
    if (this.client) {
      this.listenTo(this.client);
      this.client.refreshRooms();
    }
    this.render();
  }

  private tearDown(): void {
    this.isShown = false;
    this.stopPolling();
    this.stopListening();
    this.dismissGallery();
    this.overlay?.remove();
    this.overlay = null;
  }

  // --- Ligação com o servidor --------------------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.client) {
      return;
    }
    if (!this.hasValidName()) {
      return;
    }
    this.setMessage('Conectando…', true);
    try {
      const connection = await ServerConnection.connect(this.serverAddress.trim());
      const client = new LobbyClient(connection);
      // O aviso de conteúdo novo vale para a conexão inteira (saguão e partida), por isso não sai junto com a cena.
      client.onContentStale(showReloadNotice);
      this.client = client;
      this.listenTo(client);
      this.hubView = 'hub';
      this.setMessage('', false);
      client.refreshRooms();
    } catch (error) {
      this.setMessage(error instanceof ConnectionError ? error.message : 'Não foi possível conectar ao servidor.', false);
    }
  }

  private disconnect(): void {
    this.client?.disconnect();
    this.client = null;
    this.stopPolling();
    this.stopListening();
    this.setMessage('', false);
  }

  private listenTo(client: LobbyClient): void {
    this.unsubscribers.push(
      client.onChange(() => {
        // Entrou numa sala: o erro de antes (ex.: senha errada) não vale mais.
        if (client.isInRoom) this.message = '';
        this.render();
      }),
      client.onRoomList(() => this.renderRoomList()),
      client.onError((message) => this.setMessage(message, false)),
      client.onRoomClosed((notice) => this.setMessage(notice, false)),
      client.onMatchStarted((session) => this.startNetworkMatch(client, session)),
      client.onConnectionClosed(() => this.handleConnectionClosed()),
    );
  }

  private stopListening(): void {
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }

  /** Pede a lista de salas de tempos em tempos, só enquanto o hub está na tela. */
  private startPolling(client: LobbyClient): void {
    if (this.refreshTimer !== null) {
      return;
    }
    this.refreshTimer = window.setInterval(() => client.refreshRooms(), ROOM_LIST_REFRESH_MS);
  }

  private stopPolling(): void {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private handleConnectionClosed(): void {
    this.client = null;
    this.stopPolling();
    this.stopListening();
    this.setMessage('A conexão com o servidor foi encerrada.', false);
  }

  // --- Ações -------------------------------------------------------------------------------------

  private hasValidName(): boolean {
    if (this.playerName.trim().length === 0) {
      this.setMessage('Digite seu nome.', false);
      return false;
    }
    return true;
  }

  private quickMatch(): void {
    if (this.client && this.hasValidName()) {
      this.client.quickMatch(this.playerName.trim());
    }
  }

  private createRoom(): void {
    if (!this.client || !this.hasValidName()) {
      return;
    }
    const password = this.newRoomPassword.trim();
    this.client.createRoom(this.playerName.trim(), {
      visibility: this.newRoomVisibility,
      password: password || undefined,
      modifiers: this.newRoomModifiers,
      maximumPlayers: this.newRoomPlayerCount,
    });
  }

  private joinByCode(): void {
    const code = this.typedRoomCode();
    if (code && this.client && this.hasValidName()) {
      this.client.joinRoom(code, this.playerName.trim(), this.roomPassword || undefined);
    }
  }

  /** Assistir não pede nome: quem assiste não aparece para os jogadores. */
  private watchByCode(): void {
    const code = this.typedRoomCode();
    if (code) {
      this.client?.spectate(code, this.roomPassword || undefined);
    }
  }

  private typedRoomCode(): string | null {
    const code = this.roomCode.trim();
    if (!/^[A-Za-z]{4}$/.test(code)) {
      this.setMessage('O código da sala tem 4 letras.', false);
      return null;
    }
    return code;
  }

  /** Entrar numa sala da lista; salas com senha pedem a senha. */
  private joinListed(room: RoomSummaryView): void {
    if (!this.client || !this.hasValidName()) {
      return;
    }
    const password = this.askRoomPassword(room);
    if (password !== null) {
      this.client.joinRoom(room.roomCode, this.playerName.trim(), password || undefined);
    }
  }

  private watchListed(room: RoomSummaryView): void {
    const password = this.askRoomPassword(room);
    if (password !== null) {
      this.client?.spectate(room.roomCode, password || undefined);
    }
  }

  /** Texto vazio para salas sem senha; `null` se a pessoa desistiu de digitar. */
  private askRoomPassword(room: RoomSummaryView): string | null {
    if (!room.hasPassword) {
      return '';
    }
    return window.prompt(`Senha da sala ${room.roomCode}:`) || null;
  }

  private leaveRoom(): void {
    this.client?.leaveRoom();
    this.setMessage('', false);
    this.client?.refreshRooms();
  }

  private startLocalMatch(): void {
    const playerCount = this.localPlayerCount;
    const createSession = () => new LocalMatchSession({ playerCount });
    const data: GameSceneData = { session: createSession(), playAgain: createSession, endButtonLabel: 'Jogar novamente' };
    this.scene.start('GameScene', data);
  }

  private startNetworkMatch(client: LobbyClient, session: RemoteMatchSession): void {
    this.watchForClosedRoom(client, session);
    const data: GameSceneData = {
      session,
      playAgain: (gameScene) => {
        gameScene.scene.start('LobbyScene', { client } satisfies LobbySceneData);
        return null;
      },
      endButtonLabel: 'Voltar ao saguão',
    };
    this.scene.start('GameScene', data);
  }

  /** Se a sala for encerrada com a partida na tela, volta ao hub explicando o motivo. */
  private watchForClosedRoom(client: LobbyClient, session: RemoteMatchSession): void {
    this.stopWatchingMatch = client.onRoomClosed((notice) => {
      session.dispose();
      this.game.scene.stop('GameScene');
      this.game.scene.start('LobbyScene', { client, notice } satisfies LobbySceneData);
    });
  }

  // --- Consulta de personagens ---------------------------------------------------------------------

  private openGallery(): void {
    if (this.closeGallery) {
      return;
    }
    const client = this.client;
    const content = client ? client.content : DEFAULT_GAME_CONTENT;
    const synergyIds = content.synergies.map((synergy) => synergy.id);
    const rotationIndex = rotationIndexAt(Date.now(), content.rotation);
    // Com a galeria aberta o saguão sai de cena, para não receber cliques nem toques.
    this.setOverlayVisible(false);
    this.closeGallery = openCharacterGallery({
      content,
      synergyMapping: synergyMappingForIndex(rotationIndex, content.rotation, content.initialSynergyMapping, synergyIds),
      spriteUrlOf: client ? (path) => `${client.spriteBaseUrl}${path}` : undefined,
      onClose: () => {
        this.closeGallery = null;
        this.setOverlayVisible(true);
      },
    });
  }

  private dismissGallery(): void {
    const close = this.closeGallery;
    this.closeGallery = null;
    close?.();
  }

  private setOverlayVisible(isVisible: boolean): void {
    if (this.overlay) {
      this.overlay.style.display = isVisible ? 'flex' : 'none';
    }
  }

  // --- Tela ---------------------------------------------------------------------------------------

  private setMessage(message: string, isBusy: boolean): void {
    this.message = message;
    this.isBusy = isBusy;
    this.render();
  }

  private render(): void {
    const overlay = this.overlay;
    if (!this.isShown || !overlay) {
      return;
    }
    const scrollTop = overlay.scrollTop;
    this.roomListContainer = null;
    const client = this.client;
    let content: HTMLElement;
    if (client?.isInRoom) {
      this.stopPolling();
      content = this.buildRoomPanel(client);
    } else if (client) {
      content = this.hubView === 'create' ? this.buildCreatePanel() : this.buildHubPanel();
      if (this.hubView === 'hub') {
        this.startPolling(client);
      } else {
        this.stopPolling();
      }
    } else {
      this.stopPolling();
      content = this.buildEntryPanel();
    }
    overlay.replaceChildren(content);
    if (this.hubView === 'hub' && client && !client.isInRoom) {
      this.renderRoomList();
    }
    overlay.scrollTop = scrollTop;
  }

  private panelStyle(width: number): string {
    return `${PANEL_BASE_STYLE};width:min(${width}px,100%)`;
  }

  private buildEntryPanel(): HTMLElement {
    const panel = element('div', this.panelStyle(460));
    panel.append(element('div', 'font-size:28px;font-weight:bold;text-align:center;', 'Merge do Escritório'));
    const localRow = element('div', `${ROW_STYLE}align-items:flex-end;`);
    const countField = this.buildPlayerCountField(this.localPlayerCount, (count) => (this.localPlayerCount = count));
    countField.style.flex = '1 1 110px';
    const localButton = this.buildButton('Jogar contra bots (neste navegador)', '#16a34a', () => this.startLocalMatch());
    localButton.style.flex = '3 1 220px';
    localRow.append(countField, localButton);
    panel.append(localRow, this.buildButton('Personagens', '#7c3aed', () => this.openGallery()));
    panel.append(element('div', 'border-top:1px solid #2f3e5c;margin:6px 0;'));
    panel.append(element('div', 'font-weight:bold;', 'Jogar em rede'));
    panel.append(this.buildField('Seu nome', this.playerName, (value) => (this.playerName = value), MAXIMUM_PLAYER_NAME_LENGTH));
    panel.append(this.buildField('Endereço do servidor', this.serverAddress, (value) => (this.serverAddress = value), 100));
    panel.append(this.buildButton('Conectar', '#2563eb', () => void this.connect()));
    panel.append(this.buildMessage());
    return panel;
  }

  private buildHubPanel(): HTMLElement {
    const panel = element('div', this.panelStyle(720));
    const header = element('div', `${ROW_STYLE}justify-content:space-between;align-items:center;`);
    const headerActions = element('div', ROW_STYLE);
    headerActions.append(this.buildButton('Personagens', '#7c3aed', () => this.openGallery()), this.buildButton('Desconectar', '#334155', () => this.disconnect()));
    header.append(element('div', 'font-size:24px;font-weight:bold;', 'Salas'), headerActions);
    panel.append(header);

    const nameRow = this.buildField('Seu nome', this.playerName, (value) => (this.playerName = value), MAXIMUM_PLAYER_NAME_LENGTH);
    panel.append(nameRow);

    const actions = element('div', ROW_STYLE);
    const quick = this.buildButton('⚡ Partida rápida', '#16a34a', () => this.quickMatch());
    quick.style.flex = '1 1 180px';
    const create = this.buildButton('Criar sala', '#2563eb', () => {
      this.hubView = 'create';
      this.render();
    });
    create.style.flex = '1 1 180px';
    actions.append(quick, create);
    panel.append(actions);

    const codeRow = element('div', `${ROW_STYLE}align-items:flex-end;`);
    const codeField = this.buildField('Código da sala', this.roomCode, (value) => (this.roomCode = value), 4, true);
    codeField.style.flex = '1 1 120px';
    const passwordField = this.buildField('Senha (se tiver)', this.roomPassword, (value) => (this.roomPassword = value), MAXIMUM_ROOM_PASSWORD_LENGTH, false, 'password');
    passwordField.style.flex = '1 1 140px';
    codeRow.append(codeField, passwordField, this.buildButton('Entrar', '#2563eb', () => this.joinByCode()), this.buildButton('Assistir', '#334155', () => this.watchByCode()));
    panel.append(codeRow);

    panel.append(element('div', 'font-weight:bold;margin-top:4px;', 'Salas públicas'));
    const list = element('div', 'display:flex;flex-direction:column;gap:6px;min-height:60px;');
    this.roomListContainer = list;
    panel.append(list);
    panel.append(element('div', 'font-size:12px;color:#94a3b8;', 'A lista atualiza sozinha. Salas privadas só aparecem para quem tem o código.'));
    panel.append(this.buildMessage());
    return panel;
  }

  /** Redesenha só a lista de salas (sem refazer o formulário, para não atrapalhar quem está digitando). */
  private renderRoomList(): void {
    const container = this.roomListContainer;
    const client = this.client;
    if (!container || !client) {
      return;
    }
    container.replaceChildren();
    if (client.rooms.length === 0) {
      container.append(element('div', 'padding:14px;text-align:center;color:#94a3b8;background:#0f1a30;border-radius:6px;', 'Nenhuma sala pública no momento. Use "Partida rápida" ou crie uma sala.'));
      return;
    }
    for (const room of client.rooms) {
      container.append(this.buildRoomRow(room));
    }
  }

  private buildRoomRow(room: RoomSummaryView): HTMLElement {
    const row = element('div', `${ROW_STYLE}align-items:center;padding:9px 11px;border-radius:6px;background:#0f1a30;`);
    const info = element('div', 'flex:1 1 200px;min-width:0;');
    const title = element('div', 'font-weight:bold;', `${room.hasPassword ? '🔒 ' : ''}Sala de ${room.hostName}`);
    const status = room.status === 'playing' ? 'em partida' : 'aguardando';
    const watching = room.spectatorCount > 0 ? ` · ${room.spectatorCount} assistindo` : '';
    const meta = element('div', 'font-size:12px;color:#94a3b8;', `${room.roomCode} · ${room.playerCount}/${room.maximumPlayers} jogadores · ${status}${watching}`);
    info.append(title, meta);
    const rules = describeRoomModifiers(room.modifiers);
    if (rules.length > 0) {
      const tags = element('div');
      rules.forEach((rule) => tags.append(element('span', TAG_STYLE, rule)));
      info.append(tags);
    }
    row.append(info, room.status === 'playing' ? this.buildWatchButton(room) : this.buildJoinButton(room));
    return row;
  }

  private buildJoinButton(room: RoomSummaryView): HTMLButtonElement {
    const canJoin = room.playerCount < room.maximumPlayers;
    return this.buildListButton(canJoin ? 'Entrar' : 'Cheia', '#2563eb', canJoin, () => this.joinListed(room));
  }

  private buildWatchButton(room: RoomSummaryView): HTMLButtonElement {
    return this.buildListButton(room.canBeWatched ? 'Assistir' : 'Plateia cheia', '#7c3aed', room.canBeWatched, () => this.watchListed(room));
  }

  private buildListButton(label: string, color: string, isEnabled: boolean, onClick: () => void): HTMLButtonElement {
    const button = this.buildButton(label, color, onClick);
    button.disabled = !isEnabled;
    button.style.opacity = isEnabled ? '1' : '0.5';
    return button;
  }

  private buildCreatePanel(): HTMLElement {
    const panel = element('div', this.panelStyle(560));
    panel.append(element('div', 'font-size:24px;font-weight:bold;', 'Criar sala'));

    const visibility = element('div', 'display:flex;flex-direction:column;gap:6px;');
    visibility.append(element('div', 'color:#94a3b8;font-size:13px;', 'Quem pode ver a sala'));
    for (const option of [
      { value: 'public' as const, label: 'Pública: aparece na lista de salas' },
      { value: 'private' as const, label: 'Privada: só entra quem tiver o código' },
    ]) {
      const label = element('label', `${TOUCH_TARGET_STYLE}display:flex;gap:8px;align-items:center;cursor:pointer;`);
      const radio = element('input');
      radio.type = 'radio';
      radio.name = 'visibilidade';
      radio.checked = this.newRoomVisibility === option.value;
      radio.addEventListener('change', () => {
        this.newRoomVisibility = option.value;
      });
      label.append(radio, option.label);
      visibility.append(label);
    }
    panel.append(visibility);

    panel.append(this.buildPlayerCountField(this.newRoomPlayerCount, (count) => (this.newRoomPlayerCount = count)));
    panel.append(element('div', 'font-size:12px;color:#94a3b8;', 'As vagas que ninguém ocupar são preenchidas por bots.'));

    panel.append(this.buildField('Senha da sala (opcional)', this.newRoomPassword, (value) => (this.newRoomPassword = value), MAXIMUM_ROOM_PASSWORD_LENGTH, false, 'password'));

    panel.append(element('div', 'font-weight:bold;margin-top:6px;', 'Regras da sala'));
    const grid = element('div', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;');
    for (const field of MODIFIER_FIELDS) {
      const options = ROOM_MODIFIER_CHOICES[field.key].map((value) => ({ value, label: field.format(value) }));
      grid.append(
        this.buildNumberSelect(field.label, options, this.newRoomModifiers[field.key], (value) => {
          this.newRoomModifiers = { ...this.newRoomModifiers, [field.key]: value };
        }),
      );
    }
    panel.append(grid);
    panel.append(element('div', 'font-size:12px;color:#94a3b8;', 'As regras valem para todos da sala (bots inclusive) e aparecem na lista de salas.'));

    const actions = element('div', `${ROW_STYLE}margin-top:6px;`);
    const create = this.buildButton('Criar sala', '#16a34a', () => this.createRoom());
    create.style.flex = '1';
    actions.append(this.buildButton('Voltar', '#334155', () => {
      this.hubView = 'hub';
      this.render();
    }), create);
    panel.append(actions);
    panel.append(this.buildMessage());
    return panel;
  }

  private buildRoomPanel(client: LobbyClient): HTMLElement {
    const { roomCode, status, members, visibility, hasPassword, modifiers, maximumPlayers } = client.state;
    const panel = element('div', this.panelStyle(480));
    panel.append(element('div', 'font-size:14px;color:#94a3b8;text-align:center;', visibility === 'private' ? 'Sala privada: passe o código a quem for jogar' : 'Código da sala (passe aos outros jogadores)'));
    panel.append(element('div', 'font-size:44px;font-weight:bold;letter-spacing:10px;text-align:center;color:#fbbf24;', roomCode ?? ''));

    const badges = element('div', 'text-align:center;');
    badges.append(element('span', TAG_STYLE, visibility === 'private' ? 'Privada' : 'Pública'));
    if (hasPassword) badges.append(element('span', TAG_STYLE, '🔒 Com senha'));
    describeRoomModifiers(modifiers).forEach((rule) => badges.append(element('span', TAG_STYLE, rule)));
    panel.append(badges);

    const list = element('div', 'display:flex;flex-direction:column;gap:6px;');
    members.forEach((member) => {
      const isYou = member.playerId === client.state.playerId;
      const label = `${member.name}${isYou ? ' (você)' : ''}${member.isHost ? ' · anfitrião' : ''}${member.connected ? '' : ' · desconectado'}`;
      list.append(element('div', `padding:8px 10px;border-radius:5px;background:#0f1a30;${member.connected ? '' : 'opacity:0.5;'}`, label));
    });
    const freeSeats = maximumPlayers - members.length;
    if (freeSeats > 0) {
      list.append(element('div', 'padding:8px 10px;color:#94a3b8;', `${freeSeats} ${freeSeats === 1 ? 'vaga será preenchida' : 'vagas serão preenchidas'} por bots`));
    }
    panel.append(list);

    if (status === 'playing') {
      panel.append(element('div', 'text-align:center;color:#94a3b8;', 'A partida está começando…'));
    } else if (client.isHost) {
      panel.append(this.buildButton('Iniciar partida', '#16a34a', () => client.startMatch()));
    } else {
      panel.append(element('div', 'text-align:center;color:#94a3b8;', 'Aguardando o anfitrião iniciar a partida…'));
    }
    panel.append(this.buildButton('Sair da sala', '#dc2626', () => this.leaveRoom()));
    panel.append(this.buildMessage());
    return panel;
  }

  private buildPlayerCountField(value: number, onChange: (count: number) => void): HTMLElement {
    const options = PLAYER_COUNT_CHOICES.map((count) => ({ value: count, label: `${count} jogadores` }));
    return this.buildNumberSelect('Jogadores', options, value, onChange);
  }

  private buildNumberSelect(label: string, options: readonly { readonly value: number; readonly label: string }[], value: number, onChange: (value: number) => void): HTMLElement {
    const select = element('select', INPUT_STYLE);
    for (const choice of options) {
      const option = element('option', '', choice.label);
      option.value = String(choice.value);
      select.append(option);
    }
    select.value = String(value);
    select.addEventListener('change', () => onChange(Number(select.value)));
    const wrapper = element('label', LABEL_STYLE, label);
    wrapper.append(select);
    return wrapper;
  }

  private buildField(label: string, value: string, onInput: (value: string) => void, maximumLength: number, isUppercase = false, type = 'text'): HTMLElement {
    const wrapper = element('label', LABEL_STYLE, label);
    const input = element('input', INPUT_STYLE);
    input.type = type;
    input.value = value;
    input.maxLength = maximumLength;
    input.autocomplete = 'off';
    input.addEventListener('input', () => {
      if (isUppercase) {
        // Ajusta o próprio campo, sem reconstruir a tela (isso tiraria o foco).
        input.value = input.value.toUpperCase();
      }
      onInput(input.value);
    });
    wrapper.append(input);
    return wrapper;
  }

  private buildButton(label: string, color: string, onClick: () => void): HTMLButtonElement {
    const button = element('button', `${BUTTON_STYLE}background:${color};${this.isBusy ? 'opacity:0.6;' : ''}`, label);
    button.disabled = this.isBusy;
    button.addEventListener('click', onClick);
    return button;
  }

  private buildMessage(): HTMLElement {
    return element('div', 'min-height:20px;text-align:center;color:#f87171;', this.message);
  }
}
