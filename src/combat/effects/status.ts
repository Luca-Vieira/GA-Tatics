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
  /** Muda quando um efeito contínuo mais forte substitui o que estava ativo. */
  tickMs: number | null;
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

/**
 * Aplica o estado. Reaplicar o mesmo estado não acumula: renova a duração e fica com a maior intensidade. Nos efeitos
 * contínuos (veneno, drenagem) vale o de maior dano por segundo, com o intervalo dele; um mais fraco não altera nem
 * prolonga o mais forte.
 */
export function applyStatusToUnit(target: CombatUnit, sourceId: string, spec: StatusSpec, nowMs: number): void {
  const newEndsAtMs = nowMs + spec.durationMs;
  const existing = findStatus(target, spec.kind);
  if (existing && isWeakerPeriodicEffect(spec, existing)) {
    return;
  }
  if (existing) {
    existing.endsAtMs = Math.max(existing.endsAtMs, newEndsAtMs);
    takeStrongerIntensity(existing, spec, nowMs);
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

function isWeakerPeriodicEffect(spec: StatusSpec, existing: StatusInstance): boolean {
  return spec.tickMs !== null && existing.tickMs !== null && spec.value / spec.tickMs < existing.value / existing.tickMs;
}

function takeStrongerIntensity(existing: StatusInstance, spec: StatusSpec, nowMs: number): void {
  if (spec.tickMs === null) {
    existing.value = Math.max(existing.value, spec.value);
    return;
  }
  existing.value = spec.value;
  existing.tickMs = spec.tickMs;
  existing.nextTickAtMs = Math.min(existing.nextTickAtMs, nowMs + spec.tickMs);
}
