import { playBotPreparation } from '../players/botStrategy';
import { isAlive } from '../players/playerState';
import type { Game, RoundSummary } from './Game';

export interface BotMatchReport {
  readonly rounds: number;
  readonly winnerId: string | null;
  readonly summaries: readonly RoundSummary[];
  /** Duração, em segundos simulados, de cada combate disputado. */
  readonly combatSeconds: readonly number[];
}

/** Rodadas além disso indicam partida travada (por exemplo, só empates); interrompe para não girar para sempre. */
const MAXIMUM_ROUNDS = 100;

/** Joga a partida inteira com todos os jogadores vivos controlados por bots. Serve aos testes e ao simulador em lote. */
export function playMatchWithBots(game: Game): BotMatchReport {
  const summaries: RoundSummary[] = [];
  if (game.phase === 'result') {
    // Retoma uma partida que parou na tela de resultado (ex.: o jogador humano caiu e o restante é decidido entre os bots).
    game.startNextRound();
  }
  while (!game.isFinished && summaries.length < MAXIMUM_ROUNDS) {
    game.players.filter(isAlive).forEach((player) => playBotPreparation(game, player.id));
    game.resolveCombats();
    summaries.push(game.concludeRound());
    if (!game.isFinished) {
      game.startNextRound();
    }
  }
  const combatSeconds = summaries.flatMap((summary) => summary.duels.map((duel) => duel.result.durationMs / 1000));
  return { rounds: summaries.length, winnerId: game.winnerId, summaries, combatSeconds };
}
