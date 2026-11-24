import type { Duel, DuelOutcome, Game } from '@core/game/Game';
import { isAlive, type PlayerState } from '@core/players/playerState';
import type { DuelOutcomeView, DuelView, OwnPlayerView, PublicPlayerView } from '../protocol/serverMessages';

/** Converte o estado interno em mensagens seguras: cada jogador só recebe o que tem direito de ver. */

export function buildOwnView(game: Game, playerId: string): OwnPlayerView {
  const player = game.getPlayer(playerId);
  return {
    coins: player.coins,
    lives: player.lives,
    ready: player.ready,
    shop: player.shop.map((offer) => (offer ? { characterId: offer.characterId, cost: offer.cost, frozen: offer.frozen === true } : null)),
    units: player.units.map((unit) => ({ id: unit.id, characterId: unit.characterId, starLevel: unit.starLevel, location: unit.location })),
    synergies: game.synergyStatusesOf(playerId).map((status) => ({ synergyId: status.synergy.id, count: status.count, activeTierIndex: status.activeTierIndex })),
  };
}

export function buildPublicPlayers(game: Game): PublicPlayerView[] {
  return game.players.map(toPublicView);
}

function toPublicView(player: PlayerState): PublicPlayerView {
  return { playerId: player.id, name: player.name, isBot: player.isBot, lives: player.lives, eliminatedInRound: isAlive(player) ? null : player.eliminatedInRound };
}

export function toDuelView(duel: Duel): DuelView {
  return { topId: duel.topId, bottomId: duel.bottomId, combatConfig: duel.combatConfig, result: duel.result };
}

export function toOutcomeView(outcome: DuelOutcome): DuelOutcomeView {
  return {
    topId: outcome.topId,
    bottomId: outcome.bottomId,
    winnerId: outcome.winnerId,
    loserId: outcome.loserId,
    livesLost: outcome.livesLost,
    durationMs: outcome.result.durationMs,
  };
}
