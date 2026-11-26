import type { CombatConfig } from '@combat/engine/CombatSimulation';
import type { GameContent } from '@data/schemas/content';
import type { RoomModifiers } from '@data/schemas/roomModifiers';
import type { CombatResult } from '@combat/engine/result';
import type { ActionFailure } from '@core/players/playerActions';
import type { UnitLocation } from '@core/players/playerState';

/** Mensagens que o servidor envia aos clientes. Só dados simples (JSON): nada de funções nem de referências internas. */

export const PROTOCOL_VERSION = 4;

export type RoomStatus = 'lobby' | 'playing';
export type RoomVisibility = 'public' | 'private';

/** Uma sala da lista pública. */
export interface RoomSummaryView {
  readonly roomCode: string;
  readonly hostName: string;
  readonly playerCount: number;
  readonly maximumPlayers: number;
  readonly hasPassword: boolean;
  readonly status: RoomStatus;
  readonly modifiers: RoomModifiers;
  readonly spectatorCount: number;
  /** Há partida em andamento e ainda cabe mais um espectador. */
  readonly canBeWatched: boolean;
}

export interface RoomMemberView {
  readonly playerId: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly connected: boolean;
}

export interface UnitView {
  readonly id: string;
  readonly characterId: string;
  readonly starLevel: 1 | 2 | 3;
  readonly location: UnitLocation;
}

export interface SynergyStatusView {
  readonly synergyId: string;
  readonly count: number;
  /** -1 quando nenhum nível está ativo. */
  readonly activeTierIndex: number;
}

/** O que o jogador pode ver de si mesmo: loja, moedas e unidades ficam escondidas dos adversários. */
export interface OwnPlayerView {
  readonly coins: number;
  readonly lives: number;
  readonly ready: boolean;
  readonly shop: readonly ({ readonly characterId: string; readonly cost: number; readonly frozen: boolean } | null)[];
  readonly units: readonly UnitView[];
  readonly synergies: readonly SynergyStatusView[];
}

export interface PublicPlayerView {
  readonly playerId: string;
  readonly name: string;
  readonly isBot: boolean;
  readonly lives: number;
  readonly eliminatedInRound: number | null;
}

export interface DuelView {
  readonly topId: string;
  readonly bottomId: string;
  readonly combatConfig: CombatConfig;
  readonly result: CombatResult;
}

export interface DuelOutcomeView {
  readonly topId: string;
  readonly bottomId: string;
  readonly winnerId: string | null;
  readonly loserId: string | null;
  readonly livesLost: number;
  readonly durationMs: number;
}

/** O que descreve uma partida para quem passa a vê-la (jogando ou assistindo). */
export interface MatchSetupView {
  readonly players: readonly PublicPlayerView[];
  readonly synergyMapping: Readonly<Record<string, string>>;
  readonly rotationIndex: number;
  /** Regras especiais da sala (vidas, tempos, renda e status extras). */
  readonly modifiers: RoomModifiers;
  /** Versão do conteúdo com que a partida foi criada; se for diferente da do cliente, ele precisa recarregar a página. */
  readonly contentVersion: number;
}

export type ServerMessage =
  /** Primeira mensagem da conexão: traz o conteúdo do jogo (elenco, sinergias, configuração) vigente no servidor. */
  | { readonly type: 'hello'; readonly protocolVersion: number; readonly contentVersion: number; readonly content: GameContent }
  /** O administrador publicou conteúdo novo: o cliente deve pedir que a pessoa recarregue a página. */
  | { readonly type: 'content_updated'; readonly contentVersion: number }
  | { readonly type: 'room_joined'; readonly roomCode: string; readonly playerId: string }
  | {
      readonly type: 'room_state';
      readonly roomCode: string;
      readonly status: RoomStatus;
      readonly members: readonly RoomMemberView[];
      readonly visibility: RoomVisibility;
      readonly hasPassword: boolean;
      readonly modifiers: RoomModifiers;
      readonly maximumPlayers: number;
    }
  /** Resposta a `list_rooms`: só as salas públicas. */
  | { readonly type: 'room_list'; readonly rooms: readonly RoomSummaryView[] }
  /** A sala acabou. Com `notice`, foi encerrada por fora (administrador, jogadores saíram) e a tela deve explicar. */
  | { readonly type: 'room_closed'; readonly notice?: string }
  | ({ readonly type: 'match_started' } & MatchSetupView)
  /** Resposta a `spectate_room`: a pessoa passou a assistir (sem vaga na sala). */
  | ({ readonly type: 'spectate_started'; readonly roomCode: string; readonly watchedPlayerId: string } & MatchSetupView)
  /** Resposta a `watch_player`; em seguida vem o retrato atual da partida na visão desse jogador. */
  | { readonly type: 'watching'; readonly playerId: string }
  /** Alguém saiu e um bot assumiu a vaga. */
  | { readonly type: 'players_updated'; readonly players: readonly PublicPlayerView[] }
  | {
      readonly type: 'round_started';
      readonly round: number;
      readonly preparationSeconds: number;
      /** Hora do servidor (ms) em que a preparação termina, para o cliente desenhar o cronômetro. */
      readonly preparationEndsAtMs: number;
      readonly serverTimeMs: number;
      readonly unitLimit: number;
      readonly opponentId: string | null;
    }
  | { readonly type: 'player_view'; readonly view: OwnPlayerView }
  | { readonly type: 'action_result'; readonly ok: true; readonly fusionCount: number }
  | { readonly type: 'action_result'; readonly ok: false; readonly reason: ActionFailure }
  /** `elapsedMs` só vem para quem começa a assistir com o combate em andamento. */
  | { readonly type: 'combat_started'; readonly round: number; readonly duel: DuelView | null; readonly elapsedMs?: number }
  | {
      readonly type: 'round_result';
      readonly round: number;
      readonly duels: readonly DuelOutcomeView[];
      readonly restingId: string | null;
      readonly eliminatedIds: readonly string[];
      readonly towersLostByPlayerId: Readonly<Record<string, number>>;
      readonly players: readonly PublicPlayerView[];
    }
  | { readonly type: 'match_ended'; readonly winnerId: string | null; readonly standings: readonly { readonly playerId: string; readonly place: number }[] }
  | { readonly type: 'error'; readonly code: ServerErrorCode };

export type ServerErrorCode =
  | 'invalid_message'
  | 'message_too_large'
  | 'invalid_json'
  | 'rate_limited'
  | 'not_in_room'
  | 'already_in_room'
  | 'room_not_found'
  | 'room_full'
  | 'wrong_password'
  | 'match_in_progress'
  | 'not_host'
  | 'no_match_running'
  | 'spectators_full'
  | 'spectator_cannot_act'
  | 'not_spectating'
  | 'unknown_player'
  | 'server_full'
  | 'internal_error';
