import type { StarLevel } from '@combat/units/stats';
import type { Hex } from '@shared/utils/hex';

/**
 * Onde a unidade está. As casas do tabuleiro ficam sempre no referencial do lado A (linhas 0 a 3), que é
 * "a metade do jogador"; a tela e o combate espelham a casa quando o jogador luta como lado B.
 */
export type UnitLocation = { readonly kind: 'board'; readonly cell: Hex } | { readonly kind: 'bench'; readonly slot: number };

export interface OwnedUnit {
  readonly id: string;
  readonly characterId: string;
  readonly starLevel: StarLevel;
  /** Ordem de aquisição (e de criação, no caso de fusões); decide quem é a "primeira" unidade de uma fusão. */
  readonly acquiredOrder: number;
  location: UnitLocation;
}

export interface ShopSlot {
  readonly characterId: string;
  readonly cost: number;
  /** Oferta congelada: continua na loja quando ela é atualizada e na rodada seguinte, até ser comprada ou descongelada. */
  readonly frozen?: boolean;
}

export interface PlayerState {
  readonly id: string;
  readonly name: string;
  readonly isBot: boolean;
  lives: number;
  coins: number;
  units: OwnedUnit[];
  /** Uma posição por oferta; `null` quando a oferta já foi comprada. */
  shop: (ShopSlot | null)[];
  ready: boolean;
  /** Rodada em que o jogador foi eliminado; `null` enquanto estiver vivo. */
  eliminatedInRound: number | null;
  /** Contador usado para dar ids e ordem de aquisição às unidades. */
  unitSerial: number;
}

export function createPlayerState(player: { readonly id: string; readonly name: string; readonly isBot: boolean }, lives: number, coins: number): PlayerState {
  return { id: player.id, name: player.name, isBot: player.isBot, lives, coins, units: [], shop: [], ready: false, eliminatedInRound: null, unitSerial: 0 };
}

export function isAlive(player: PlayerState): boolean {
  return player.eliminatedInRound === null;
}

export function boardUnitsOf(player: PlayerState): OwnedUnit[] {
  return player.units.filter((unit) => unit.location.kind === 'board');
}

export function benchUnitsOf(player: PlayerState): OwnedUnit[] {
  return player.units.filter((unit) => unit.location.kind === 'bench');
}
