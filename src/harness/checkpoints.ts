import type { EventBus } from "./events";
import type { RunStore } from "./store";

/** Writes a resumable snapshot of the run at every phase transition. */
export class CheckpointManager {
  private counter = 0;

  constructor(
    private readonly runId: string,
    private readonly bus: EventBus,
    private readonly store: RunStore,
  ) {}

  restore(state: { counter: number }) {
    this.counter = state.counter;
  }

  get count() {
    return this.counter;
  }

  /**
   * The event log is flushed first so a resumed run never holds state whose events were lost.
   * A failed write is not fatal: the run continues and a crash would resume from an earlier checkpoint.
   */
  async save(phase: string, round: number, label: string, state: (checkpointId: string) => unknown): Promise<string> {
    const checkpointId = `cp${++this.counter}`;
    const event = this.bus.emit({ type: "checkpoint.created", data: { checkpointId, phase, round, label } });
    try {
      await this.bus.flush();
      await this.store.saveCheckpoint(this.runId, { id: checkpointId, seq: event.seq, phase, round, label, state: state(checkpointId) });
    } catch {
      // Keep running without this checkpoint.
    }
    return checkpointId;
  }
}
