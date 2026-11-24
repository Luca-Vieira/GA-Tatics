import type { StatusKind } from '@data/schemas/ability';
import type { CombatUnit } from '../units/unit';

/** Descrição de um estado temporário a aplicar em uma unidade. */
export interface StatusSpec {
  readonly kind: StatusKind;
  readonly durationMs: number;
  /** Intensidade; veneno e drenagem já chegam convertidos em dano por pulso. */
  readonly value: number;
  readonly tickMs: number | null;
  readonly charges: number | null;
  readonly healRatio: number;
}

/** Estado temporário ativo em uma unidade. */
export interface StatusInstance {
  readonly kind: StatusKind;
  sourceId: string;
  endsAtMs: number;
  value: number;
  readonly tickMs: number | null;
  nextTickAtMs: number;
  chargesLeft: number | null;
  healRatio: number;
}

export function findStatus(unit: CombatUnit, kind: StatusKind): StatusInstance | undefined {
  return unit.statuses.find((status) => status.kind === kind);
}

export function removeStatus(unit: CombatUnit, status: StatusInstance): void {
  const position = unit.statuses.indexOf(status);
  if (position >= 0) {
    unit.statuses.splice(position, 1);
  }
}

/** Aplica o estado. Reaplicar o mesmo estado renova a duração e fica com a maior intensidade, sem acumular. */
export function applyStatusToUnit(target: CombatUnit, sourceId: string, spec: StatusSpec, nowMs: number): void {
  const newEndsAtMs = nowMs + spec.durationMs;
  const existing = findStatus(target, spec.kind);
  if (existing) {
    existing.endsAtMs = Math.max(existing.endsAtMs, newEndsAtMs);
    existing.value = Math.max(existing.value, spec.value);
    existing.chargesLeft = spec.charges === null ? existing.chargesLeft : Math.max(existing.chargesLeft ?? 0, spec.charges);
    existing.sourceId = sourceId;
    return;
  }
  target.statuses.push({
    kind: spec.kind,
    sourceId,
    endsAtMs: newEndsAtMs,
    value: spec.value,
    tickMs: spec.tickMs,
    nextTickAtMs: spec.tickMs === null ? Infinity : nowMs + spec.tickMs,
    chargesLeft: spec.charges,
    healRatio: spec.healRatio,
  });
}
