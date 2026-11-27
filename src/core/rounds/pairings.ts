export type Pair = readonly [string, string];

/** O que aconteceu em uma rodada, para evitar repetir confrontos e distribuir os descansos. */
export interface RoundRecord {
  readonly round: number;
  readonly pairs: readonly Pair[];
  readonly resting: string | null;
}

export interface RoundPairings {
  readonly pairs: readonly Pair[];
  /** Quem descansa na rodada (só existe com número ímpar de jogadores vivos). */
  readonly resting: string | null;
}

/**
 * Define os confrontos da rodada (GDD 2.2). Com 4 jogadores a ordem é AB/CD, AC/BD, AD/BC e depois repete,
 * porque sempre se escolhe o pareamento que menos repetiu confrontos (e, no empate, o mais antigo).
 * Com número ímpar, descansa quem menos descansou até aqui; no empate vale `restDrawOrder`, a ordem sorteada da
 * partida (descansar poupa vidas, então um desempate fixo favoreceria sempre o mesmo lugar).
 */
export function createPairings(aliveIdsInOrder: readonly string[], history: readonly RoundRecord[], restDrawOrder: readonly string[] = []): RoundPairings {
  const orderedIds = [...aliveIdsInOrder].sort();
  const resting = orderedIds.length % 2 === 1 ? chooseRestingPlayer(orderedIds, history, restDrawOrder) : null;
  const fighters = orderedIds.filter((id) => id !== resting);
  if (fighters.length === 0) {
    return { pairs: [], resting };
  }

  const meetings = countMeetings(history);
  let bestPairs: readonly Pair[] = [];
  let bestScore: PairingScore | null = null;
  for (const candidate of enumerateMatchings(fighters)) {
    const score = scorePairing(candidate, meetings);
    if (bestScore === null || isBetterScore(score, bestScore)) {
      bestScore = score;
      bestPairs = candidate;
    }
  }
  return { pairs: bestPairs, resting };
}

function chooseRestingPlayer(orderedIds: readonly string[], history: readonly RoundRecord[], restDrawOrder: readonly string[]): string {
  const restCount = (id: string) => history.filter((record) => record.resting === id).length;
  const lastRestRound = (id: string) => Math.max(0, ...history.filter((record) => record.resting === id).map((record) => record.round));
  // Quem não está na ordem sorteada vai para o fim; entre esses, vale o id.
  const drawPosition = (id: string) => {
    const position = restDrawOrder.indexOf(id);
    return position < 0 ? restDrawOrder.length : position;
  };
  const ranked = [...orderedIds].sort(
    (first, second) => restCount(first) - restCount(second) || lastRestRound(first) - lastRestRound(second) || drawPosition(first) - drawPosition(second) || (first < second ? -1 : 1),
  );
  return ranked[0] as string;
}

interface MeetingRecord {
  count: number;
  lastRound: number;
}

function pairKey(first: string, second: string): string {
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function countMeetings(history: readonly RoundRecord[]): Map<string, MeetingRecord> {
  const meetings = new Map<string, MeetingRecord>();
  for (const record of history) {
    for (const [first, second] of record.pairs) {
      const key = pairKey(first, second);
      const previous = meetings.get(key);
      meetings.set(key, { count: (previous?.count ?? 0) + 1, lastRound: record.round });
    }
  }
  return meetings;
}

interface PairingScore {
  /** Quantas vezes, somadas, os confrontos deste pareamento já aconteceram. */
  readonly totalMeetings: number;
  /** Rodada do confronto repetido mais recente; quanto menor, melhor. */
  readonly mostRecentRound: number;
}

function scorePairing(pairs: readonly Pair[], meetings: ReadonlyMap<string, MeetingRecord>): PairingScore {
  let totalMeetings = 0;
  let mostRecentRound = 0;
  for (const [first, second] of pairs) {
    const meeting = meetings.get(pairKey(first, second));
    totalMeetings += meeting?.count ?? 0;
    mostRecentRound = Math.max(mostRecentRound, meeting?.lastRound ?? 0);
  }
  return { totalMeetings, mostRecentRound };
}

function isBetterScore(candidate: PairingScore, best: PairingScore): boolean {
  if (candidate.totalMeetings !== best.totalMeetings) {
    return candidate.totalMeetings < best.totalMeetings;
  }
  return candidate.mostRecentRound < best.mostRecentRound;
}

interface PartialMatching {
  readonly remaining: readonly string[];
  readonly pairs: readonly Pair[];
}

/** Todos os pareamentos perfeitos, em ordem lexicográfica (AB/CD antes de AC/BD...). Usa pilha explícita, sem recursão. */
function enumerateMatchings(ids: readonly string[]): Pair[][] {
  const completed: Pair[][] = [];
  const pending: PartialMatching[] = [{ remaining: ids, pairs: [] }];
  while (pending.length > 0) {
    const current = pending.pop() as PartialMatching;
    const [first, ...others] = current.remaining;
    if (first === undefined) {
      completed.push([...current.pairs] as Pair[]);
      continue;
    }
    // Empilha de trás para a frente para que o primeiro parceiro seja o primeiro a sair.
    for (let position = others.length - 1; position >= 0; position--) {
      const partner = others[position] as string;
      const remaining = others.filter((_, index) => index !== position);
      pending.push({ remaining, pairs: [...current.pairs, [first, partner]] });
    }
  }
  return completed;
}
