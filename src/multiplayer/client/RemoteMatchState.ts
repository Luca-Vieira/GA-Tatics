import type { CharacterDefinition } from '@data/schemas/character';
import type { GameContent } from '@data/schemas/content';
import type { MatchView } from '@core/game/MatchSession';
import { applyRoomModifiers, describeRoomModifiers } from '@core/game/roomModifiers';
import { boardUnitsOf, type OwnedUnit, type PlayerState } from '@core/players/playerState';
import { summarizeSynergies } from '@core/synergies/synergies';
import { buildTowerCharacters } from '@core/tower/tower';
import { mirrorCell } from '@shared/constants/board';
import type { DuelView, MatchSetupView, OwnPlayerView, PublicPlayerView, ServerMessage, UnitView } from '../protocol/serverMessages';

type RoundStartedMessage = Extract<ServerMessage, { type: 'round_started' }>;
type MatchEndedMessage = Extract<ServerMessage, { type: 'match_ended' }>;

/**
 * Espelho da partida no cliente, montado só com o que o servidor envia. Serve de `MatchView` para a interface:
 * da própria pessoa há loja, moedas e unidades; dos demais jogadores só nome, vidas e eliminação
 * (as unidades dos adversários ficam escondidas, então a lista delas fica vazia).
 * Quem assiste não recebe loja, moedas nem reserva de ninguém: só o tabuleiro do acompanhado durante o combate.
 * Regras e dados vêm dos padrões do jogo: servidor e cliente precisam usar o mesmo elenco e a mesma configuração.
 */
export class RemoteMatchState implements MatchView {
  readonly config: GameContent['config'];
  readonly synergies: GameContent['synergies'];
  readonly synergyRotation: GameContent['rotation'];
  /** Regras especiais da sala em texto curto (vazio = regras normais). */
  readonly roomRules: readonly string[];
  readonly synergyMapping: Readonly<Record<string, string>>;
  readonly rotationIndex: number;

  round = 0;
  unitLimit = 0;

  private readonly playerList: PlayerState[];
  private readonly charactersById: ReadonlyMap<string, CharacterDefinition>;
  private opponentId: string | null = null;
  private finalStandings: MatchEndedMessage['standings'] = [];

  constructor(
    private humanId: string,
    started: MatchSetupView,
    content: GameContent,
  ) {
    // A configuração já vem com as vidas, os tempos e a renda da sala, igual à que o servidor usa.
    this.config = applyRoomModifiers(content.config, started.modifiers);
    this.roomRules = describeRoomModifiers(started.modifiers);
    this.synergies = content.synergies;
    this.synergyRotation = content.rotation;
    this.synergyMapping = started.synergyMapping;
    this.rotationIndex = started.rotationIndex;
    this.charactersById = new Map([...content.characters, ...buildTowerCharacters(this.config.tower)].map((character) => [character.id, character]));
    this.playerList = started.players.map((player) => ({
      id: player.playerId,
      name: player.name,
      isBot: player.isBot,
      lives: player.lives,
      coins: 0,
      units: [],
      shop: [],
      ready: false,
      eliminatedInRound: player.eliminatedInRound,
      unitSerial: 0,
    }));
  }

  get players(): readonly PlayerState[] {
    return this.playerList;
  }

  getPlayer(playerId: string): PlayerState {
    const player = this.playerList.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error(`Jogador desconhecido: ${playerId}`);
    }
    return player;
  }

  getCharacter(characterId: string): CharacterDefinition {
    const character = this.charactersById.get(characterId);
    if (!character) {
      throw new Error(`Personagem desconhecido: ${characterId}`);
    }
    return character;
  }

  /** O servidor só informa o adversário de quem recebe a mensagem; dos demais jogadores o cliente não sabe. */
  opponentOf(playerId: string): string | null {
    return playerId === this.humanId ? this.opponentId : null;
  }

  synergyStatusesOf(playerId: string) {
    const boardCharacterIds = boardUnitsOf(this.getPlayer(playerId)).map((unit) => unit.characterId);
    return summarizeSynergies(boardCharacterIds, this.synergyMapping, this.synergies);
  }

  /** Só existe depois de `match_ended`. */
  standings() {
    return [...this.finalStandings];
  }

  // --- Atualizações vindas do servidor -------------------------------------------------------------

  applyRoundStarted(message: RoundStartedMessage): void {
    this.round = message.round;
    this.unitLimit = message.unitLimit;
    this.opponentId = message.opponentId;
  }

  applyOwnView(view: OwnPlayerView): void {
    const human = this.getPlayer(this.humanId);
    human.coins = view.coins;
    human.lives = view.lives;
    human.ready = view.ready;
    human.shop = view.shop.map((offer) => (offer ? { characterId: offer.characterId, cost: offer.cost, frozen: offer.frozen } : null));
    human.units = view.units.map((unit, index): OwnedUnit => ({ id: unit.id, characterId: unit.characterId, starLevel: unit.starLevel, acquiredOrder: index, location: unit.location }));
  }

  applyPublicPlayers(players: readonly PublicPlayerView[]): void {
    for (const view of players) {
      const player = this.playerList.find((candidate) => candidate.id === view.playerId);
      if (player) {
        player.isBot = view.isBot;
        player.lives = view.lives;
        player.eliminatedInRound = view.eliminatedInRound;
      }
    }
  }

  applyMatchEnded(message: MatchEndedMessage): void {
    this.finalStandings = message.standings;
  }

  // --- Quem assiste -------------------------------------------------------------------------------

  watch(playerId: string): void {
    this.humanId = playerId;
    this.clearBoards();
  }

  clearBoards(): void {
    this.playerList.forEach((player) => {
      player.units = [];
    });
  }

  /** Jogador eliminado, na preparação: o tabuleiro atual de quem ele acompanha. */
  showScoutedBoard(units: readonly UnitView[]): void {
    this.getPlayer(this.humanId).units = units.map((unit, index): OwnedUnit => ({ id: unit.id, characterId: unit.characterId, starLevel: unit.starLevel, acquiredOrder: index, location: unit.location }));
  }

  /** Monta o tabuleiro do jogador acompanhado com o que o duelo mostra (nas casas do referencial dele). */
  showWatchedBoard(duel: DuelView): void {
    const side = duel.topId === this.humanId ? 'A' : 'B';
    const specs = duel.combatConfig.units.filter((spec) => spec.side === side && spec.characterId !== undefined);
    this.getPlayer(this.humanId).units = specs.map((spec, index): OwnedUnit => ({
      id: spec.id.slice(side.length + 1),
      characterId: spec.characterId!,
      starLevel: spec.starLevel ?? 1,
      acquiredOrder: index,
      location: { kind: 'board', cell: side === 'A' ? spec.cell : mirrorCell(spec.cell) },
    }));
  }
}
