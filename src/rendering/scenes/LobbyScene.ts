import Phaser from 'phaser';
import { LocalMatchSession } from '@core/game/LocalMatchSession';
import { LobbyClient } from '@multiplayer/client/LobbyClient';
import type { RemoteMatchSession } from '@multiplayer/client/RemoteMatchSession';
import { ConnectionError, ServerConnection } from '@multiplayer/client/ServerConnection';
import { MAXIMUM_PLAYER_NAME_LENGTH } from '@multiplayer/protocol/clientMessages';
import { PLAYERS_PER_MATCH } from '@multiplayer/protocol/serverMessages';
import { showReloadNotice } from '../ui/reloadNotice';
import type { GameSceneData } from './GameScene';

export interface LobbySceneData {
  /** Presente quando o jogador volta ao saguão depois de uma partida em rede. */
  readonly client?: LobbyClient;
}

const DEFAULT_SERVER_PORT = 8787;
const SCREEN_CENTER = { x: 640, y: 360 };

const PANEL_STYLE = [
  'width:460px',
  'box-sizing:border-box',
  'padding:28px',
  'background:#16213a',
  'border:2px solid #2f3e5c',
  'border-radius:8px',
  'color:#e5e7eb',
  'font-family:Arial,sans-serif',
  'font-size:15px',
  'display:flex',
  'flex-direction:column',
  'gap:12px',
].join(';');
const INPUT_STYLE = 'padding:9px 10px;border-radius:5px;border:1px solid #3b4d73;background:#0f1a30;color:#e5e7eb;font-size:15px;';
const BUTTON_STYLE = 'padding:11px 14px;border:0;border-radius:5px;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;';

function defaultServerAddress(): string {
  const host = window.location.hostname || 'localhost';
  return `ws://${host}:${DEFAULT_SERVER_PORT}`;
}

/** Cria um elemento com estilo e texto (o texto nunca é lido como HTML, então nomes de jogadores não injetam nada). */
function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, style = '', text = ''): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  created.style.cssText = style;
  created.textContent = text;
  return created;
}

/** Tela inicial: jogar contra bots no navegador ou criar/entrar numa sala de um servidor de rede e esperar o anfitrião iniciar. */
export class LobbyScene extends Phaser.Scene {
  private client: LobbyClient | null = null;
  private panel: Phaser.GameObjects.DOMElement | null = null;
  private readonly unsubscribers: (() => void)[] = [];

  private playerName = '';
  private serverAddress = defaultServerAddress();
  private roomCode = '';
  private message = '';
  private isBusy = false;
  private isShown = false;

  constructor() {
    super('LobbyScene');
  }

  init(data: LobbySceneData): void {
    this.client = data.client?.isConnected ? data.client : null;
    this.message = '';
    this.isBusy = false;
  }

  create(): void {
    this.isShown = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.isShown = false;
      this.stopListening();
    });
    if (this.client) {
      this.listenTo(this.client);
    }
    this.render();
  }

  // --- Ligação com o servidor --------------------------------------------------------------------

  private async connect(): Promise<LobbyClient | null> {
    if (this.client) {
      return this.client;
    }
    this.setMessage('Conectando…', true);
    try {
      const connection = await ServerConnection.connect(this.serverAddress);
      const client = new LobbyClient(connection);
      // O aviso de conteúdo novo vale para a conexão inteira (saguão e partida), por isso não sai junto com a cena.
      client.onContentStale(showReloadNotice);
      this.client = client;
      this.listenTo(client);
      this.setMessage('', false);
      return client;
    } catch (error) {
      this.setMessage(error instanceof ConnectionError ? error.message : 'Não foi possível conectar ao servidor.', false);
      return null;
    }
  }

  private listenTo(client: LobbyClient): void {
    this.unsubscribers.push(
      client.onChange(() => this.render()),
      client.onError((message) => this.setMessage(message, false)),
      client.onMatchStarted((session) => this.startNetworkMatch(client, session)),
      client.onConnectionClosed(() => this.handleConnectionClosed()),
    );
  }

  private stopListening(): void {
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }

  private handleConnectionClosed(): void {
    this.client = null;
    this.stopListening();
    this.setMessage('A conexão com o servidor foi encerrada.', false);
  }

  private async createRoom(): Promise<void> {
    const name = this.playerName.trim();
    if (!this.hasValidName(name)) {
      return;
    }
    const client = await this.connect();
    client?.createRoom(name);
  }

  private async joinRoom(): Promise<void> {
    const name = this.playerName.trim();
    const code = this.roomCode.trim();
    if (!this.hasValidName(name)) {
      return;
    }
    if (!/^[A-Za-z]{4}$/.test(code)) {
      this.setMessage('O código da sala tem 4 letras.', false);
      return;
    }
    const client = await this.connect();
    client?.joinRoom(code, name);
  }

  private hasValidName(name: string): boolean {
    if (name.length === 0) {
      this.setMessage('Digite seu nome.', false);
      return false;
    }
    return true;
  }

  // --- Início da partida --------------------------------------------------------------------------

  private startLocalMatch(): void {
    const data: GameSceneData = { session: new LocalMatchSession(), playAgain: () => new LocalMatchSession(), endButtonLabel: 'Jogar novamente' };
    this.scene.start('GameScene', data);
  }

  private startNetworkMatch(client: LobbyClient, session: RemoteMatchSession): void {
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

  private leaveRoom(): void {
    this.client?.leaveRoom();
    this.setMessage('', false);
  }

  // --- Tela ---------------------------------------------------------------------------------------

  private setMessage(message: string, isBusy: boolean): void {
    this.message = message;
    this.isBusy = isBusy;
    this.render();
  }

  private render(): void {
    if (!this.isShown) {
      return;
    }
    this.panel?.destroy();
    const content = this.client?.isInRoom ? this.buildRoomPanel(this.client) : this.buildEntryPanel();
    // O Phaser controla o `display` do elemento raiz; por isso o painel (que usa flex) vai dentro de um invólucro.
    const wrapper = element('div');
    wrapper.append(content);
    this.panel = this.add.dom(SCREEN_CENTER.x, SCREEN_CENTER.y, wrapper);
  }

  private buildEntryPanel(): HTMLElement {
    const panel = element('div', PANEL_STYLE);
    panel.append(element('div', 'font-size:28px;font-weight:bold;text-align:center;', 'Merge do Escritório'));

    panel.append(this.buildButton('Jogar contra bots (neste navegador)', '#16a34a', () => this.startLocalMatch()));
    panel.append(element('div', 'border-top:1px solid #2f3e5c;margin:6px 0;'));
    panel.append(element('div', 'font-weight:bold;', 'Jogar em rede'));

    panel.append(this.buildField('Seu nome', this.playerName, (value) => (this.playerName = value), MAXIMUM_PLAYER_NAME_LENGTH));
    panel.append(this.buildField('Endereço do servidor', this.serverAddress, (value) => (this.serverAddress = value), 100));

    const roomRow = element('div', 'display:flex;gap:10px;align-items:flex-end;');
    const codeField = this.buildField('Código da sala', this.roomCode, (value) => (this.roomCode = value), 4, true);
    codeField.style.flex = '1';
    roomRow.append(codeField, this.buildButton('Entrar', '#2563eb', () => void this.joinRoom()));
    panel.append(roomRow);
    panel.append(this.buildButton('Criar sala', '#2563eb', () => void this.createRoom()));

    panel.append(this.buildMessage());
    return panel;
  }

  private buildRoomPanel(client: LobbyClient): HTMLElement {
    const { roomCode, status, members } = client.state;
    const panel = element('div', PANEL_STYLE);
    panel.append(element('div', 'font-size:14px;color:#94a3b8;text-align:center;', 'Código da sala (passe aos outros jogadores)'));
    panel.append(element('div', 'font-size:44px;font-weight:bold;letter-spacing:10px;text-align:center;color:#fbbf24;', roomCode ?? ''));

    const list = element('div', 'display:flex;flex-direction:column;gap:6px;');
    members.forEach((member) => {
      const isYou = member.playerId === client.state.playerId;
      const label = `${member.name}${isYou ? ' (você)' : ''}${member.isHost ? ' · anfitrião' : ''}${member.connected ? '' : ' · desconectado'}`;
      list.append(element('div', `padding:8px 10px;border-radius:5px;background:#0f1a30;${member.connected ? '' : 'opacity:0.5;'}`, label));
    });
    const freeSeats = PLAYERS_PER_MATCH - members.length;
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

  private buildField(label: string, value: string, onInput: (value: string) => void, maximumLength: number, isUppercase = false): HTMLElement {
    const wrapper = element('label', 'display:flex;flex-direction:column;gap:4px;color:#94a3b8;font-size:13px;', label);
    const input = element('input', INPUT_STYLE);
    input.value = value;
    input.maxLength = maximumLength;
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
