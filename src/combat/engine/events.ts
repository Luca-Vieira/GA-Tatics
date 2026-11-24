import type { StatusKind } from '@data/schemas/ability';
import type { BoardSide } from '@shared/constants/board';
import type { Hex } from '@shared/utils/hex';

export type DamageCause = 'attack' | 'ability' | 'poison' | 'drain';

export interface AbilityVisualInfo {
  readonly kind: 'burst' | 'projectile' | 'rain' | 'aura' | 'none';
  readonly color: string;
}

/** Eventos emitidos pela simulação. O renderizador os usa para animar; não influenciam o resultado. */
export type CombatEvent =
  | { readonly type: 'move'; readonly timeMs: number; readonly unitId: string; readonly from: Hex; readonly to: Hex; readonly durationMs: number }
  | {
      readonly type: 'attack';
      readonly timeMs: number;
      readonly attackerId: string;
      readonly targetId: string;
      /** Dano efetivamente causado (0 se errou). */
      readonly damage: number;
      readonly targetHealthAfter: number;
      readonly isRanged: boolean;
      readonly missed: boolean;
    }
  | { readonly type: 'death'; readonly timeMs: number; readonly unitId: string }
  | {
      readonly type: 'ability';
      readonly timeMs: number;
      readonly casterId: string;
      readonly abilityName: string;
      readonly center: Hex;
      readonly radius: number;
      readonly visual: AbilityVisualInfo;
    }
  | {
      readonly type: 'damage';
      readonly timeMs: number;
      readonly sourceId: string | null;
      readonly targetId: string;
      readonly amount: number;
      readonly healthAfter: number;
      readonly cause: Exclude<DamageCause, 'attack'>;
    }
  | { readonly type: 'heal'; readonly timeMs: number; readonly sourceId: string | null; readonly targetId: string; readonly amount: number; readonly healthAfter: number }
  | { readonly type: 'status'; readonly timeMs: number; readonly unitId: string; readonly status: StatusKind; readonly change: 'applied' | 'expired' }
  | { readonly type: 'projectile'; readonly timeMs: number; readonly fromId: string; readonly toId: string }
  | {
      readonly type: 'spawn';
      readonly timeMs: number;
      readonly unitId: string;
      readonly name: string;
      readonly side: BoardSide;
      readonly cell: Hex;
      readonly ownerId: string;
    }
  | { readonly type: 'trap'; readonly timeMs: number; readonly trapId: string; readonly change: 'placed' | 'triggered' | 'expired'; readonly cell: Hex; readonly side: BoardSide };
