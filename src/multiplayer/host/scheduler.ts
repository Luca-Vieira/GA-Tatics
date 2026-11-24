/** Relógio injetável: o servidor usa o tempo real, os testes avançam o tempo à mão e a partida fica determinística. */
export interface Scheduler {
  /** Executa `callback` depois de `delayMs`. Devolve uma função que cancela. */
  after(delayMs: number, callback: () => void): () => void;
  nowMs(): number;
}

export const realScheduler: Scheduler = {
  after(delayMs, callback) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
  nowMs: () => Date.now(),
};

interface PendingTask {
  readonly dueAtMs: number;
  readonly order: number;
  readonly callback: () => void;
}

/** Relógio de mentira para testes: nada acontece até alguém chamar `advance`. */
export class ManualScheduler implements Scheduler {
  private currentMs = 0;
  private nextOrder = 0;
  private tasks: PendingTask[] = [];

  nowMs(): number {
    return this.currentMs;
  }

  after(delayMs: number, callback: () => void): () => void {
    const task: PendingTask = { dueAtMs: this.currentMs + Math.max(0, delayMs), order: this.nextOrder++, callback };
    this.tasks.push(task);
    return () => {
      this.tasks = this.tasks.filter((candidate) => candidate !== task);
    };
  }

  get pendingCount(): number {
    return this.tasks.length;
  }

  /** Avança o relógio, executando as tarefas na ordem em que vencem (inclusive as criadas durante o avanço). */
  advance(milliseconds: number): void {
    const targetMs = this.currentMs + milliseconds;
    for (let next = this.nextDueTask(targetMs); next; next = this.nextDueTask(targetMs)) {
      this.tasks = this.tasks.filter((task) => task !== next);
      this.currentMs = Math.max(this.currentMs, next.dueAtMs);
      next.callback();
    }
    this.currentMs = targetMs;
  }

  private nextDueTask(limitMs: number): PendingTask | undefined {
    return this.tasks.filter((task) => task.dueAtMs <= limitMs).sort((first, second) => first.dueAtMs - second.dueAtMs || first.order - second.order)[0];
  }
}
