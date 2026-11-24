import type { AbilityDefinition } from '@data/schemas/ability';
import type { Hex } from '@shared/utils/hex';
import type { CombatUnit } from '../units/unit';

/** Contexto de um uso de habilidade. */
export interface CastContext {
  readonly caster: CombatUnit;
  readonly ability: AbilityDefinition;
  /** Ponto central do efeito (a casa do alvo, do próprio personagem ou o centro do grupo). */
  readonly center: Hex;
  /** Unidade no centro, quando há (o alvo; o próprio personagem nas habilidades sobre si). */
  readonly primary: CombatUnit | null;
}
