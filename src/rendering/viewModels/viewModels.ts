import type { ActionFailure } from '@core/players/playerActions';
import { describeSynergyEffect, formatCountdown } from '@core/synergies/describe';
import { millisecondsUntilNextRotation } from '@core/synergies/rotation';
import { activeEffectsOf } from '@core/synergies/synergies';
import { isTowerId } from '@core/tower/tower';
import type { MatchView, RoundResultDuel, RoundResultSummary } from '@core/game/MatchSession';
import { STAR_MULTIPLIERS, toCombatStats, type StarLevel } from '@combat/units/stats';
import type { CombatUnitInspection } from '@combat/units/inspect';
import type { CombatUnit } from '@combat/units/unit';
import { attackOf } from '@data/schemas/attack';
import type { BehaviorProfile, CharacterDefinition } from '@data/schemas/character';
import type { SynergyDefinition } from '@data/schemas/synergy';
import { describeAttackArea } from '@shared/utils/attackArea';
import type { InfoModel, InfoStatLine } from '../ui/InfoPanel';
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
  spectator: 'Você está só assistindo.',
};

const TARGET_PRIORITY_LABELS: Readonly<Record<BehaviorProfile['targetPriority'], string>> = {
  nearest: 'o inimigo mais próximo',
  farthest: 'o inimigo mais distante',
  lowest_health: 'o inimigo com menos vida',
  cluster: 'o maior grupo de inimigos',
};

const NEUTRAL_COLOR = '#94a3b8';

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
      synergyColor: colorNumber(synergy?.color ?? NEUTRAL_COLOR),
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

/** Critério de alvo e jeito de se mover, em texto. */
export function describeBehavior(behavior: BehaviorProfile): string {
  const target = `Mira ${TARGET_PRIORITY_LABELS[behavior.targetPriority]}.`;
  if (behavior.movement !== 'kite' || behavior.preferredDistance <= 1) {
    return target;
  }
  return `${target} Recua para manter ${behavior.preferredDistance} casas de distância.`;
}

function synergyFields(game: MatchView, characterId: string | null): Pick<InfoModel, 'synergyName' | 'synergyColor' | 'synergyBonusText'> {
  const synergy = characterId === null ? undefined : synergyOf(game, characterId);
  const tierSummaries = (synergy?.tiers ?? []).map((tier) => `${tier.threshold}: ${tier.effects.map(describeSynergyEffect).join(', ')}`);
  return { synergyName: synergy?.name ?? '', synergyColor: colorNumber(synergy?.color ?? NEUTRAL_COLOR), synergyBonusText: tierSummaries.join('\n') };
}

/** Detalhes de um personagem; `starLevel` e `sellValue` só existem quando a carta é uma unidade do jogador. */
export function buildInfoModel(game: MatchView, characterId: string, starLevel: StarLevel | null, sellValue: number | null): InfoModel {
  const character = game.getCharacter(characterId);
  const multipliers = character.evolution.starMultipliers ? { ...STAR_MULTIPLIERS, ...character.evolution.starMultipliers } : STAR_MULTIPLIERS;
  const stats = toCombatStats(character.stats, starLevel ?? 1, multipliers);
  const healthLine: InfoStatLine = { label: 'Vida', scaleValue: character.stats.health, displayValue: String(Math.round(stats.maxHealth)) };
  const attack = attackOf(character);
  const isTower = isTowerId(characterId);

  return {
    title: character.name,
    starLevel,
    subtitle: `${character.archetype} · ${RARITY_LABELS[character.rarity]}`,
    accentColor: RARITY_COLORS[character.rarity],
    ...synergyFields(game, characterId),
    // A torre não ataca nem se move: só a vida importa.
    stats: isTower
      ? [healthLine]
      : [
          healthLine,
          { label: 'Dano', scaleValue: character.stats.damage, displayValue: String(Math.round(stats.damage)) },
          { label: 'Ataque', scaleValue: character.stats.attackSpeed, displayValue: `${stats.attacksPerSecond.toFixed(2)}/s` },
          { label: 'Alcance', scaleValue: character.stats.range, displayValue: String(stats.range) },
          { label: 'Mobilidade', scaleValue: character.stats.mobility, displayValue: `${stats.hexesPerSecond.toFixed(2)}/s` },
        ],
    attackText: isTower ? '' : describeAttackArea(attack.shape, stats.range, attack.maxTargets, attack.splashDamageFraction),
    traitText: isTower ? 'Estrutura: não ataca nem se move. Os inimigos podem destruí-la.' : describeBehavior(character.behavior),
    statusText: '',
    abilityName: character.ability.name,
    abilityDescription: character.ability.description,
    cooldownText: abilityTimingText(character),
    sellValue,
  };
}

// --- Consulta durante o combate -----------------------------------------------------------------------

/** "120" ou, quando um efeito mudou o valor, "150 (base 120)". */
function withBase(current: number, base: number, format: (value: number) => string): string {
  return format(current) === format(base) ? format(current) : `${format(current)} (base ${format(base)})`;
}

function combatStatLines(inspection: CombatUnitInspection): InfoStatLine[] {
  const healthRatio = inspection.maxHealth > 0 ? inspection.health / inspection.maxHealth : 0;
  const health: InfoStatLine = { label: 'Vida', scaleValue: healthRatio * 10, displayValue: `${Math.ceil(inspection.health)} / ${Math.round(inspection.maxHealth)}` };
  const protection: InfoStatLine = { label: 'Proteção', scaleValue: null, displayValue: `${Math.round(inspection.damageReduction * 100)}%` };
  if (inspection.isStructure || inspection.isDecoy) {
    return [health, protection];
  }
  return [
    health,
    { label: 'Dano', scaleValue: null, displayValue: withBase(inspection.damage, inspection.baseDamage, (value) => String(Math.round(value))) },
    { label: 'Ataque', scaleValue: null, displayValue: withBase(inspection.attacksPerSecond, inspection.baseAttacksPerSecond, (value) => `${value.toFixed(2)}/s`) },
    { label: 'Alcance', scaleValue: null, displayValue: `${inspection.range} ${inspection.range === 1 ? 'casa' : 'casas'}` },
    { label: 'Movimento', scaleValue: null, displayValue: `${inspection.hexesPerSecond.toFixed(2)}/s` },
    protection,
  ];
}

function combatTraitText(unit: Readonly<CombatUnit>, inspection: CombatUnitInspection, nowMs: number): string {
  if (inspection.isStructure) {
    return 'Estrutura: não ataca nem se move.';
  }
  const lifetime = unit.expiresAtMs === null ? '' : ` Some em ${Math.max(0, Math.ceil((unit.expiresAtMs - nowMs) / 1000))} s.`;
  if (inspection.isDecoy) {
    return `Clone provocador: não ataca e atrai inimigos a até ${unit.tauntRadius} casas.${lifetime}`;
  }
  const summon = inspection.isSummon ? `Invocação: não conta para o resultado.${lifetime} ` : '';
  return `${summon}${describeBehavior(unit.behavior)}`;
}

function combatStatusText(inspection: CombatUnitInspection): string {
  if (!inspection.alive) {
    return 'Fora de combate.';
  }
  if (inspection.statuses.length === 0) {
    return '';
  }
  return `Efeitos: ${inspection.statuses.map((status) => `${status.label} (${Math.ceil(status.remainingSeconds)} s)`).join(', ')}`;
}

function combatCooldownText(inspection: CombatUnitInspection): string {
  const activation = inspection.ability?.activation.type;
  if (activation === undefined || activation === 'passive' || activation === 'first_hit_on_target') {
    return activation === 'first_hit_on_target' ? 'Em cada novo alvo' : activation === 'passive' ? 'Passiva' : '';
  }
  const seconds = Math.ceil(inspection.abilityReadyInSeconds);
  return seconds > 0 ? `Pronta em ${seconds} s` : 'Pronta';
}

export interface CombatInfoContext {
  /** Ex.: "Sua equipe", "Adversário" ou o nome do jogador (para quem assiste). */
  readonly teamLabel: string;
  readonly nowMs: number;
}

/** Retrato ao vivo de uma unidade em combate. */
export function buildCombatInfoModel(game: MatchView, unit: Readonly<CombatUnit>, inspection: CombatUnitInspection, context: CombatInfoContext): InfoModel {
  const character = unit.characterId === null ? null : game.getCharacter(unit.characterId);
  return {
    title: inspection.name,
    starLevel: unit.isSummon || unit.isStructure ? null : unit.starLevel,
    subtitle: character ? `${context.teamLabel} · ${character.archetype}` : context.teamLabel,
    accentColor: character ? RARITY_COLORS[character.rarity] : colorNumber(NEUTRAL_COLOR),
    ...synergyFields(game, isTowerId(unit.characterId ?? '') ? null : unit.characterId),
    synergyBonusText: '',
    stats: combatStatLines(inspection),
    attackText: inspection.isStructure || inspection.isDecoy ? '' : inspection.attackDescription,
    traitText: combatTraitText(unit, inspection, context.nowMs),
    statusText: combatStatusText(inspection),
    abilityName: inspection.ability?.name ?? '',
    abilityDescription: inspection.ability?.description ?? '',
    cooldownText: combatCooldownText(inspection),
    sellValue: null,
  };
}

// --- Placar e telas -------------------------------------------------------------------------------------

export interface ViewerOptions {
  /** Quem vê só assiste: os textos não falam em "você". */
  readonly isSpectator?: boolean;
}

export function buildTopBarModel(game: MatchView, humanId: string, timerLabel: string, phaseLabel: string, options: ViewerOptions = {}): TopBarModel {
  const opponentId = game.opponentOf(humanId);
  const highlightedName = (name: string) => (options.isSpectator ? `👁 ${name}` : `${name} (você)`);
  return {
    roundLabel: `Rodada ${game.round}`,
    phaseLabel,
    timerLabel,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.id === humanId ? highlightedName(player.name) : player.name,
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

interface ResultHeadline {
  readonly title: string;
  readonly titleColor: string;
  readonly lines: readonly string[];
}

function ownDuelHeadline(game: MatchView, duel: RoundResultDuel, humanId: string): ResultHeadline {
  const nameOf = (playerId: string) => game.getPlayer(playerId).name;
  const opponentId = duel.topId === humanId ? duel.bottomId : duel.topId;
  const lines: string[] = [];
  let headline: { title: string; titleColor: string };
  if (duel.winnerId === humanId) {
    headline = { title: 'Vitória!', titleColor: TEXT_COLORS.good };
    lines.push(`Você venceu ${nameOf(opponentId)}.`);
  } else if (duel.winnerId === null) {
    headline = { title: 'Empate', titleColor: TEXT_COLORS.gold };
    lines.push(`Você empatou com ${nameOf(opponentId)}. Ninguém perde vida.`);
  } else {
    headline = { title: 'Derrota', titleColor: TEXT_COLORS.bad };
    lines.push(`${nameOf(opponentId)} venceu. Você perdeu ${livesText(duel.livesLost)} (restam ${game.getPlayer(humanId).lives}).`);
  }
  if (duel.result) {
    const humanSide = duel.bottomId === humanId ? 'B' : 'A';
    const ownHealth = duel.result.healthPercentBySide[humanSide];
    const opponentHealth = duel.result.healthPercentBySide[humanSide === 'A' ? 'B' : 'A'];
    lines.push(`Vida restante: você ${ownHealth.toFixed(0)}% · ${nameOf(opponentId)} ${opponentHealth.toFixed(0)}%`);
  }
  return { ...headline, lines };
}

function resultHeadline(game: MatchView, ownDuel: RoundResultDuel | undefined, humanId: string, isSpectator: boolean): ResultHeadline {
  if (isSpectator) {
    return { title: 'Fim da rodada', titleColor: TEXT_COLORS.main, lines: [] };
  }
  if (!ownDuel) {
    return { title: 'Descanso', titleColor: TEXT_COLORS.muted, lines: ['Você não teve adversário nesta rodada.', 'Ninguém perde vida e você segue com os recursos normais.'] };
  }
  return ownDuelHeadline(game, ownDuel, humanId);
}

function towerLossLine(game: MatchView, ownerId: string, lostCount: number, viewerId: string | null): string {
  const compensation = game.config.tower.compensationOnLoss * lostCount;
  if (ownerId === viewerId) {
    return `Sua torre foi destruída e sumiu para sempre! Você ganha +${compensation} moedas na próxima rodada.`;
  }
  return `${game.getPlayer(ownerId).name} perdeu ${lostCount === 1 ? 'uma torre' : `${lostCount} torres`}.`;
}

/** Tela de resultado da rodada, do ponto de vista do jogador humano (ou neutra, para quem assiste). */
export function buildRoundResultScreen(game: MatchView, summary: RoundResultSummary, humanId: string, secondsLeft: number, options: ViewerOptions = {}): ScreenModel {
  const isSpectator = options.isSpectator === true;
  const nameOf = (playerId: string) => game.getPlayer(playerId).name;
  const ownDuel = isSpectator ? undefined : summary.duels.find((duel) => duel.topId === humanId || duel.bottomId === humanId);
  const headline = resultHeadline(game, ownDuel, humanId, isSpectator);
  const lines = [...headline.lines];

  const otherDuels = summary.duels.filter((duel) => duel !== ownDuel);
  if (otherDuels.length > 0 && lines.length > 0) {
    lines.push('');
  }
  for (const duel of otherDuels) {
    lines.push(
      duel.winnerId === null
        ? `${nameOf(duel.topId)} empatou com ${nameOf(duel.bottomId)}`
        : `${nameOf(duel.winnerId)} venceu ${nameOf(duel.loserId ?? '')} (−${livesText(duel.livesLost)})`,
    );
  }
  if (summary.restingId && (isSpectator || summary.restingId !== humanId)) {
    lines.push(`${nameOf(summary.restingId)} descansou.`);
  }
  Object.entries(summary.towersLostByPlayerId).forEach(([playerId, lost]) => lines.push(towerLossLine(game, playerId, lost, isSpectator ? null : humanId)));
  summary.eliminatedIds.forEach((playerId) => lines.push(`${nameOf(playerId)} foi eliminado!`));

  return { title: headline.title, titleColor: headline.titleColor, lines, buttonLabel: `Continuar (${Math.max(0, Math.ceil(secondsLeft))})` };
}

/** Tela final: colocação de todos. */
export function buildEndScreen(game: MatchView, humanId: string, options: ViewerOptions = {}): ScreenModel {
  const standings = [...game.standings()].sort((first, second) => first.place - second.place);
  const human = standings.find((standing) => standing.playerId === humanId);
  const youWon = !options.isSpectator && human?.place === 1;
  const lines = standings.map((standing) => {
    const player = game.getPlayer(standing.playerId);
    const lives = player.eliminatedInRound === null ? ` · ${livesText(player.lives)}` : ` · eliminado na rodada ${player.eliminatedInRound}`;
    return `${standing.place}º  ${player.name}${lives}`;
  });
  const ownTitle = youWon ? 'Você venceu!' : `Você ficou em ${human?.place ?? '?'}º`;
  return {
    title: options.isSpectator ? 'Partida encerrada' : ownTitle,
    titleColor: youWon ? TEXT_COLORS.gold : TEXT_COLORS.main,
    lines: [`Partida encerrada na rodada ${game.round}.`, '', ...lines],
    buttonLabel: 'Jogar novamente',
  };
}
