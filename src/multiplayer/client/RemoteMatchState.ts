import type { CharacterDefinition } from '@data/schemas/character';
import type { GameContent } from '@data/schemas/content';
import type { MatchView } from '@core/game/MatchSession';
import { boardUnitsOf, type OwnedUnit, type PlayerState } from '@core/players/playerState';
import { summarizeSynergies } from '@core/synergies/synergies';
import { buildTowerCharacter } from '@core/tower/tower';
import type { OwnPlayerView, PublicPlayerView, ServerMessage } from '../protocol/serverMessages';

type MatchStartedMessage = Extract<ServerMessage, { type: 'match_started' }>;
type RoundStartedMessage = Extract<ServerMessage, { type: 'round_started' }>;
type MatchEndedMessage = Extract<ServerMessage, { type: 'match_ended' }>;

/**
 * Espelho da partida no cliente, montado só com o que o servidor envia. Serve de `MatchView` para a interface:
 * da própria pessoa há loja, moedas e unidades; dos demais jogadores só nome, vidas e eliminação
 * (as unidades dos adversários ficam escondidas, então a lista delas fica vazia).
 * Regras e dados vêm dos padrões do jogo: servidor e cliente precisam usar o mesmo elenco e a mesma configuração.
 */
export class RemoteMatchState implements MatchView {
  readonly config: GameContent['config'];
  readonly synergies: GameContent['synergies'];
  readonly synergyRotation: GameContent['rotation'];
  readonly synergyMapping: Readonly<Record<string, string>>;
  readonly rotationIndex: number;

  round = 0;
  unitLimit = 0;

  private readonly playerList: PlayerState[];
  private readonly charactersById: ReadonlyMap<string, CharacterDefinition>;
  private opponentId: string | null = null;
  private finalStandings: MatchEndedMessage['standings'] = [];

  constructor(
    private readonly humanId: string,
    started: MatchStartedMessage,
    content: GameContent,
  ) {
    this.config = content.config;
    this.synergies = content.synergies;
    this.synergyRotation = content.rotation;
    this.synergyMapping = started.synergyMapping;
    this.rotationIndex = started.rotationIndex;
    this.charactersById = new Map([...content.characters, buildTowerCharacter(this.config.tower)].map((character) => [character.id, character]));
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
        player.lives = view.lives;
        player.eliminatedInRound = view.eliminatedInRound;
      }
    }
  }

  applyMatchEnded(message: MatchEndedMessage): void {
    this.finalStandings = message.standings;
  }
}
