import type { CombatConfig } from '@combat/engine/CombatSimulation';
import type { MapDefinition } from '@data/schemas/map';
import type { BoardSide } from '@shared/constants/board';
import type { ActionFailure } from '../players/playerActions';
import type { UnitLocation } from '../players/playerState';
import type { Game } from './Game';

/**
 * Contrato entre a apresentação (a cena do Phaser) e quem conduz a partida: a sessão local, que roda o `Game`
 * no próprio navegador, ou a sessão remota, que fala com o servidor. A cena só desenha e repassa gestos;
 * quem decide o resultado é sempre a sessão (o servidor, no modo em rede).
 */

/** O que a interface lê da partida. O `Game` já cumpre este formato; a sessão remota monta um igual a partir das mensagens. */
export type MatchView = Pick<
  Game,
  'config' | 'synergies' | 'synergyMapping' | 'rotationIndex' | 'synergyRotation' | 'round' | 'players' | 'unitLimit' | 'getPlayer' | 'getCharacter' | 'opponentOf' | 'synergyStatusesOf' | 'standings'
>;

/** Duelo do jogador humano, com o que é preciso para animá-lo. */
export interface HumanDuel {
  readonly topId: string;
  readonly bottomId: string;
  readonly combatConfig: CombatConfig;
  /** Duração do combate, já conhecida porque o resultado sai da simulação. */
  readonly durationMs: number;
  /** Quanto do combate já passou, em ms (quem começa a assistir no meio): a cena deve adiantar a animação até aqui. */
  readonly elapsedMs?: number;
}

/** Imagem de um personagem que o jogo deve baixar do servidor e usar no lugar do desenho provisório. */
export interface SpriteSource {
  /** Id do personagem; nos sprites auxiliares é `aux:<chave>`, para nunca colidir com um personagem. */
  readonly characterId: string;
  /** Só nos sprites auxiliares (torre, cavalo, protagonista...): a chave em `GameContent.auxiliarySprites`. */
  readonly auxiliaryKey?: string;
  readonly url: string;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly anchorX: number;
  readonly anchorY: number;
  /** A imagem é espelhada antes de tudo (arte enviada olhando para a esquerda). */
  readonly mirrored?: boolean;
}

/** O mapa da partida e, nos mapas com imagem, o endereço dela. */
export interface MatchScenery {
  readonly map: MapDefinition;
  readonly backgroundImageUrl: string | null;
}

export interface RoundResultDuel {
  readonly topId: string;
  readonly bottomId: string;
  readonly winnerId: string | null;
  readonly loserId: string | null;
  readonly livesLost: number;
  /** Só o duelo do próprio jogador traz a vida restante; nos demais duelos da rede ela não é enviada. */
  readonly result: { readonly healthPercentBySide: Readonly<Record<BoardSide, number>> } | null;
}

export interface RoundResultSummary {
  readonly duels: readonly RoundResultDuel[];
  readonly restingId: string | null;
  readonly eliminatedIds: readonly string[];
  /** Torres destruídas na rodada, por jogador. */
  readonly towersLostByPlayerId: Readonly<Record<string, number>>;
  readonly towerCompensationByPlayerId: Readonly<Record<string, number>>;
}

/** Avisos da sessão para a cena. Todos chegam depois de o estado de `MatchSession.match` já estar atualizado. */
export interface SessionListener {
  /** Começou uma preparação (a primeira, uma nova rodada ou um recomeço): a cena deve reiniciar a tela de preparação. */
  preparationStarted(): void;
  /** O combate foi decidido. `humanDuel` é `null` quando o jogador descansa (ou está eliminado). */
  combatStarted(humanDuel: HumanDuel | null): void;
  /** Resposta a `watchCombat`: a luta pedida, para mostrar no lugar da própria. */
  combatPeekStarted(playerId: string, duel: HumanDuel): void;
  /** O resultado oficial da rodada chegou (vidas já aplicadas). */
  roundConcluded(summary: RoundResultSummary): void;
  /** A partida acabou; a cena mostra a colocação depois que o jogador fechar o resultado da rodada. */
  matchEnded(): void;
  /** Loja, moedas, unidades ou vidas mudaram. */
  stateChanged(): void;
  actionFailed(reason: ActionFailure): void;
  fusionHappened(message: string): void;
  /** Só no modo em rede: a conexão com o servidor caiu. */
  connectionLost(): void;
}

/** Quem só assiste (plateia, ou jogador já eliminado): escolhe de quem vê o tabuleiro e os duelos. */
export interface SpectatorControls {
  readonly watchedPlayerId: string;
  watch(playerId: string): void;
}

export interface MatchSession {
  /** Jogador cuja visão a tela desenha: o próprio, ou o assistido no modo espectador. */
  readonly humanId: string;
  /** `null` para quem joga. Para quem assiste, toda ação é recusada com a falha "spectator" e nada muda. */
  readonly spectator: SpectatorControls | null;
  readonly match: MatchView;
  /** Regras especiais da sala em texto curto, para mostrar no começo da partida (vazio = regras normais). */
  readonly roomRules: readonly string[];
  /** Aparência do tabuleiro e do fundo desta partida. */
  readonly scenery: MatchScenery;
  /** Sprites a carregar antes de a partida aparecer (vazio na partida local, que usa só o desenho provisório). */
  readonly spriteSources: readonly SpriteSource[];
  /** Tempo que resta da preparação, em milissegundos. */
  readonly preparationRemainingMs: number;

  setListener(listener: SessionListener): void;
  /** Dá a partida por iniciada para a cena: dispara `preparationStarted` com o estado atual. */
  start(): void;
  /** Chamado a cada quadro; a sessão local conta os cronômetros aqui. */
  update(deltaMs: number): void;

  buy(shopSlot: number): void;
  refreshShop(): void;
  toggleFreeze(shopSlot: number): void;
  sell(unitId: string): void;
  move(unitId: string, destination: UnitLocation): void;
  setReady(isReady: boolean): void;
  /**
   * Quem ainda está vivo pede para ver a luta de outro jogador enquanto ela acontece. A resposta é `combatPeekStarted`
   * ou `actionFailed('player_not_in_combat')`. Quem já foi eliminado usa `spectator`.
   */
  watchCombat(playerId: string): void;

  /** A cena terminou de mostrar o combate (e o resultado já pode aparecer). */
  presentationFinished(): void;
  /** O jogador fechou (ou deixou expirar) a tela de resultado. */
  continueAfterResult(): void;
  /** Abandona a partida (a tela pede a confirmação antes). Em rede, um bot assume a vaga. */
  leave(): void;
  dispose(): void;
}
