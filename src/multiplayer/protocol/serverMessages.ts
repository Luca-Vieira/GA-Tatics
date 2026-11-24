import type { CombatConfig } from '@combat/engine/CombatSimulation';
import type { GameContent } from '@data/schemas/content';
import type { CombatResult } from '@combat/engine/result';
import type { ActionFailure } from '@core/players/playerActions';
import type { UnitLocation } from '@core/players/playerState';

/** Mensagens que o servidor envia aos clientes. Só dados simples (JSON): nada de funções nem de referências internas. */

export const PROTOCOL_VERSION = 2;

/** A partida é sempre de 4 jogadores; vagas sem pessoa são preenchidas por bots. */
export const PLAYERS_PER_MATCH = 4;

export type RoomStatus = 'lobby' | 'playing';

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

export type ServerMessage =
  /** Primeira mensagem da conexão: traz o conteúdo do jogo (elenco, sinergias, configuração) vigente no servidor. */
  | { readonly type: 'hello'; readonly protocolVersion: number; readonly contentVersion: number; readonly content: GameContent }
  /** O administrador publicou conteúdo novo: o cliente deve pedir que a pessoa recarregue a página. */
  | { readonly type: 'content_updated'; readonly contentVersion: number }
  | { readonly type: 'room_joined'; readonly roomCode: string; readonly playerId: string }
  | { readonly type: 'room_state'; readonly roomCode: string; readonly status: RoomStatus; readonly members: readonly RoomMemberView[] }
  | { readonly type: 'room_closed' }
  | {
      readonly type: 'match_started';
      readonly players: readonly PublicPlayerView[];
      readonly synergyMapping: Readonly<Record<string, string>>;
      readonly rotationIndex: number;
      /** Versão do conteúdo com que a partida foi criada; se for diferente da do cliente, ele precisa recarregar a página. */
      readonly contentVersion: number;
    }
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
  | { readonly type: 'combat_started'; readonly round: number; readonly duel: DuelView | null }
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
  | 'match_in_progress'
  | 'not_host'
  | 'no_match_running'
  | 'server_full'
  | 'internal_error';
