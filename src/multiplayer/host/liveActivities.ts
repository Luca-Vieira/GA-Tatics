/** Uma sala em andamento (em espera ou em jogo), como o painel de administração a enxerga. */
export interface LiveActivity {
  readonly roomCode: string;
  readonly status: 'lobby' | 'playing';
  readonly playerNames: readonly string[];
  readonly spectatorCount: number;
  /** Rodada atual; `null` enquanto a partida não começou. */
  readonly round: number | null;
}

/** O que o servidor do jogo oferece ao painel de administração para ver e encerrar o que está em andamento. */
export interface LiveActivities {
  list(): readonly LiveActivity[];
  /** Encerra a sala e avisa quem está nela. Devolve falso se a sala não existir. */
  end(roomCode: string): boolean;
}
