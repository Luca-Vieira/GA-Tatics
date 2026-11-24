import { parseRoster, type CharacterDefinition } from '../schemas/character';
import { DEFAULT_CHARACTERS } from '../defaults/characters';

/** Fonte de personagens. Hoje em memória; na Etapa 5 ganha uma implementação sobre o Firebase com a mesma interface. */
export interface CharacterRepository {
  getAll(): readonly CharacterDefinition[];
  getActive(): readonly CharacterDefinition[];
  getById(id: string): CharacterDefinition | undefined;
}

export class InMemoryCharacterRepository implements CharacterRepository {
  private readonly characters: readonly CharacterDefinition[];

  /** Recebe dados brutos e os valida; sem argumentos, usa o elenco inicial. */
  constructor(rawCharacters?: readonly unknown[]) {
    this.characters = rawCharacters ? parseRoster(rawCharacters) : DEFAULT_CHARACTERS;
  }

  getAll(): readonly CharacterDefinition[] {
    return this.characters;
  }

  getActive(): readonly CharacterDefinition[] {
    return this.characters.filter((character) => character.active);
  }

  getById(id: string): CharacterDefinition | undefined {
    return this.characters.find((character) => character.id === id);
  }
}
