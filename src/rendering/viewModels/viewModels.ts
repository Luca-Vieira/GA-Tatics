import type { ActionFailure } from '@core/players/playerActions';
import { describeSynergyEffect, formatCountdown } from '@core/synergies/describe';
import { millisecondsUntilNextRotation } from '@core/synergies/rotation';
import { activeEffectsOf } from '@core/synergies/synergies';
import { isTowerId } from '@core/tower/tower';
import type { MatchView, RoundResultSummary } from '@core/game/MatchSession';
import { STAR_MULTIPLIERS, toCombatStats, type StarLevel } from '@combat/units/stats';
import type { CharacterDefinition } from '@data/schemas/character';
import type { SynergyDefinition } from '@data/schemas/synergy';
import type { InfoModel } from '../ui/InfoPanel';
import type { ScreenModel } from '../ui/ScreenOverlay';
import type { ShopViewModel } from '../ui/ShopPanel';
import type { SynergyViewModel } from '../ui/SynergyPanel';
import type { TopBarModel } from '../ui/TopBar';
import { RARITY_COLORS, RARITY_LABELS, TEXT_COLORS } from '../ui/palette';

export const FAILURE_MESSAGES: Readonly<Record<ActionFailure, string>> = {
  not_in_preparation: 'Só dá para mudar a equipe na preparação.',
  eliminated: 'Você foi eliminado.',
  unknown_shop_slot: 'Essa oferta não existe.',
  shop_slot_empty: 'Essa oferta já foi comprada.',
  not_enough_coins: 'Moedas insuficientes.',
  no_space: 'Sem espaço: libere o tabuleiro ou a reserva.',
  unit_not_found: 'Unidade não encontrada.',
  invalid_destination: 'Essa casa não pode receber a unidade.',
  board_full: 'Limite de unidades do tabuleiro atingido.',
  tower_limit: 'Você já tem o máximo de torres.',
};

function colorNumber(hexColor: string): number {
  return Number.parseInt(hexColor.slice(1), 16);
}

function synergyOf(game: MatchView, characterId: string): SynergyDefinition | undefined {
  const synergyId = game.synergyMapping[characterId];
  return game.synergies.find((synergy) => synergy.id === synergyId);
}

export function buildShopModel(game: MatchView, playerId: string): ShopViewModel {
  const player = game.getPlayer(playerId);
  const cards = player.shop.map((offer) => {
    if (!offer) {
      return null;
    }
    const character = game.getCharacter(offer.characterId);
    const synergy = synergyOf(game, character.id);
    return {
      characterId: character.id,
      name: character.name,
      archetype: character.archetype,
      rarity: character.rarity,
      cost: offer.cost,
      synergyName: synergy?.name ?? '—',
      synergyColor: colorNumber(synergy?.color ?? '#94a3b8'),
      abilityName: character.ability.name,
      canAfford: player.coins >= offer.cost,
      advancesFusion: player.units.some((unit) => unit.characterId === character.id && unit.starLevel === 1),
      isFrozen: offer.frozen === true,
    };
  });
  return { cards, coins: player.coins, refreshCost: game.config.shop.refreshCost };
}

export function buildSynergyModel(game: MatchView, playerId: string, nowMs: number): SynergyViewModel {
  const rows = game.synergyStatusesOf(playerId).map((status) => {
    const { synergy } = status;
    const hasActiveTier = status.activeTierIndex >= 0;
    const previewEffects = synergy.tiers[0]?.effects ?? [];
    const effects = hasActiveTier ? activeEffectsOf(status) : previewEffects;
    const memberNames = Object.entries(game.synergyMapping)
      .filter(([, synergyId]) => synergyId === synergy.id)
      .map(([characterId]) => game.getCharacter(characterId).name)
      .sort();
    return {
      name: synergy.name,
      color: colorNumber(synergy.color),
      count: status.count,
      thresholds: synergy.tiers.map((tier) => tier.threshold),
      activeTierIndex: status.activeTierIndex,
      effectLines: effects.map(describeSynergyEffect),
      isPreview: !hasActiveTier,
      memberNames,
    };
  });
  const countdown = formatCountdown(millisecondsUntilNextRotation(nowMs, game.synergyRotation));
  return { rows, rotationLabel: `Rotação nº ${game.rotationIndex} · próxima troca em ${countdown}` };
}

function abilityTimingText(character: CharacterDefinition): string {
  const { activation, cooldownSeconds } = character.ability;
  switch (activation.type) {
    case 'passive':
      return 'Passiva';
    case 'first_hit_on_target':
      return 'Em cada novo alvo';
    case 'health_threshold':
      return 'Uma vez, com pouca vida';
    case 'cooldown':
      return `Recarga ${cooldownSeconds} s`;
  }
}

/** Detalhes de um personagem; `starLevel` e `sellValue` só existem quando a carta é uma unidade do jogador. */
export function buildInfoModel(game: MatchView, characterId: string, starLevel: StarLevel | null, sellValue: number | null): InfoModel {
  const character = game.getCharacter(characterId);
  const synergy = synergyOf(game, characterId);
  const multipliers = character.evolution.starMultipliers ? { ...STAR_MULTIPLIERS, ...character.evolution.starMultipliers } : STAR_MULTIPLIERS;
  const stats = toCombatStats(character.stats, starLevel ?? 1, multipliers);
  const tierSummaries = (synergy?.tiers ?? []).map((tier) => `${tier.threshold}: ${tier.effects.map(describeSynergyEffect).join(', ')}`);

  return {
    title: character.name,
    starLevel,
    subtitle: `${character.archetype} · ${RARITY_LABELS[character.rarity]}`,
    accentColor: RARITY_COLORS[character.rarity],
    synergyName: synergy?.name ?? '—',
    synergyColor: colorNumber(synergy?.color ?? '#94a3b8'),
    synergyBonusText: tierSummaries.join('\n'),
    // A torre não ataca nem se move: só a vida importa.
    stats: isTowerId(characterId)
      ? [{ label: 'Vida', scaleValue: character.stats.health, displayValue: String(Math.round(stats.maxHealth)) }]
      : [
          { label: 'Vida', scaleValue: character.stats.health, displayValue: String(Math.round(stats.maxHealth)) },
          { label: 'Dano', scaleValue: character.stats.damage, displayValue: String(Math.round(stats.damage)) },
          { label: 'Ataque', scaleValue: character.stats.attackSpeed, displayValue: `${stats.attacksPerSecond.toFixed(2)}/s` },
          { label: 'Alcance', scaleValue: character.stats.range, displayValue: String(stats.range) },
          { label: 'Mobilidade', scaleValue: character.stats.mobility, displayValue: `${stats.hexesPerSecond.toFixed(2)}/s` },
        ],
    abilityName: character.ability.name,
    abilityDescription: character.ability.description,
    cooldownText: abilityTimingText(character),
    sellValue,
  };
}

export function buildTopBarModel(game: MatchView, humanId: string, timerLabel: string, phaseLabel: string): TopBarModel {
  const opponentId = game.opponentOf(humanId);
  return {
    roundLabel: `Rodada ${game.round}`,
    phaseLabel,
    timerLabel,
    players: game.players.map((player) => ({
      name: player.id === humanId ? `${player.name} (você)` : player.name,
      lives: player.lives,
      maximumLives: game.config.rounds.startingLives,
      isYou: player.id === humanId,
      isEliminated: player.eliminatedInRound !== null,
      isOpponent: player.id === opponentId,
    })),
  };
}

function livesText(lives: number): string {
  return `${lives} ${lives === 1 ? 'vida' : 'vidas'}`;
}

/** Tela de resultado da rodada, do ponto de vista do jogador humano. */
export function buildRoundResultScreen(game: MatchView, summary: RoundResultSummary, humanId: string, secondsLeft: number): ScreenModel {
  const nameOf = (playerId: string) => game.getPlayer(playerId).name;
  const humanDuel = summary.duels.find((duel) => duel.topId === humanId || duel.bottomId === humanId);
  const human = game.getPlayer(humanId);
  const lines: string[] = [];
  let title = 'Descanso';
  let titleColor: string = TEXT_COLORS.muted;

  if (!humanDuel) {
    lines.push('Você não teve adversário nesta rodada.', 'Ninguém perde vida e você segue com os recursos normais.');
  } else {
    const opponentId = humanDuel.topId === humanId ? humanDuel.bottomId : humanDuel.topId;
    const humanSide = humanDuel.bottomId === humanId ? 'B' : 'A';
    if (humanDuel.winnerId === humanId) {
      title = 'Vitória!';
      titleColor = TEXT_COLORS.good;
      lines.push(`Você venceu ${nameOf(opponentId)}.`);
    } else if (humanDuel.winnerId === null) {
      title = 'Empate';
      titleColor = TEXT_COLORS.gold;
      lines.push(`Você empatou com ${nameOf(opponentId)}. Ninguém perde vida.`);
    } else {
      title = 'Derrota';
      titleColor = TEXT_COLORS.bad;
      lines.push(`${nameOf(opponentId)} venceu. Você perdeu ${livesText(humanDuel.livesLost)} (restam ${human.lives}).`);
    }
    if (humanDuel.result) {
      const ownHealth = humanDuel.result.healthPercentBySide[humanSide];
      const opponentHealth = humanDuel.result.healthPercentBySide[humanSide === 'A' ? 'B' : 'A'];
      lines.push(`Vida restante: você ${ownHealth.toFixed(0)}% · ${nameOf(opponentId)} ${opponentHealth.toFixed(0)}%`);
    }
  }

  const otherDuels = summary.duels.filter((duel) => duel !== humanDuel);
  if (otherDuels.length > 0) {
    lines.push('');
  }
  for (const duel of otherDuels) {
    lines.push(
      duel.winnerId === null
        ? `${nameOf(duel.topId)} empatou com ${nameOf(duel.bottomId)}`
        : `${nameOf(duel.winnerId)} venceu ${nameOf(duel.loserId ?? '')} (−${livesText(duel.livesLost)})`,
    );
  }
  if (summary.restingId && summary.restingId !== humanId) {
    lines.push(`${nameOf(summary.restingId)} descansou.`);
  }
  Object.entries(summary.towersLostByPlayerId).forEach(([playerId, lost]) => {
    const owner = playerId === humanId ? 'Sua torre foi destruída e sumiu para sempre!' : `${nameOf(playerId)} perdeu ${lost === 1 ? 'uma torre' : `${lost} torres`}.`;
    lines.push(owner);
  });
  summary.eliminatedIds.forEach((playerId) => lines.push(`${nameOf(playerId)} foi eliminado!`));

  return { title, titleColor, lines, buttonLabel: `Continuar (${Math.max(0, Math.ceil(secondsLeft))})` };
}

/** Tela final: colocação de todos. */
export function buildEndScreen(game: MatchView, humanId: string): ScreenModel {
  const standings = [...game.standings()].sort((first, second) => first.place - second.place);
  const human = standings.find((standing) => standing.playerId === humanId);
  const youWon = human?.place === 1;
  const lines = standings.map((standing) => {
    const player = game.getPlayer(standing.playerId);
    const lives = player.eliminatedInRound === null ? ` · ${livesText(player.lives)}` : ` · eliminado na rodada ${player.eliminatedInRound}`;
    return `${standing.place}º  ${player.name}${lives}`;
  });
  return {
    title: youWon ? 'Você venceu!' : `Você ficou em ${human?.place ?? '?'}º`,
    titleColor: youWon ? TEXT_COLORS.gold : TEXT_COLORS.main,
    lines: [`Partida encerrada na rodada ${game.round}.`, '', ...lines],
    buttonLabel: 'Jogar novamente',
  };
}
