// ── Task Scheduler with AbortController-based cancellation ────────────

interface SchedulerTask {
  (signal: AbortSignal): void | Promise<void>;
}

interface ScheduledItem {
  timer: ReturnType<typeof setTimeout>;
  abortController: AbortController;
}

export class TaskScheduler {
  private tasks = new Map<string, ScheduledItem>();

  /** Schedule a debounced task. Previous task with same key is cancelled. */
  schedule(key: string, delayMs: number, task: SchedulerTask): void {
    this.cancel(key);

    const abortController = new AbortController();
    const timer = setTimeout(() => {
      this.tasks.delete(key);
      if (!abortController.signal.aborted) {
        task(abortController.signal);
      }
    }, delayMs);

    this.tasks.set(key, { timer, abortController });
  }

  /** Cancel a pending task by key. */
  cancel(key: string): void {
    const existing = this.tasks.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.abortController.abort();
      this.tasks.delete(key);
    }
  }

  /** Cancel all pending tasks. */
  cancelAll(): void {
    for (const key of [...this.tasks.keys()]) {
      this.cancel(key);
    }
  }

  /** Check if a task with the given key is pending. */
  hasPending(key: string): boolean {
    return this.tasks.has(key);
  }
}

// ── Singleton instance ───────────────────────────────────────────────

export const scheduler = new TaskScheduler();
