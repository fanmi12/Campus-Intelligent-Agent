import { env } from "./env";
export type QueueState = { status: "waiting" | "running"; position: number; waiting: number; active: number };
type Entry = { signal: AbortSignal; update: (state: QueueState) => void; resolve: (release: () => void) => void; reject: (error: Error) => void; cleanup: () => void };

// 单进程生产服务的 FIFO 队列；开始处理时计入滚动一分钟额度。
export class ChatQueue {
  private pending: Entry[] = [];
  private active = 0;
  private starts: number[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private concurrency = 5, private perMinute = 20, private capacity = 40, private windowMs = 60_000, private maxWaitMs = 180_000) {}

  acquire(signal: AbortSignal, update: Entry["update"]): Promise<() => void> {
    if (signal.aborted) return Promise.reject(new Error("已取消排队"));
    if (this.pending.length >= this.capacity) return Promise.reject(new Error("排队人数已满，请稍后再试"));
    return new Promise((resolve, reject) => {
      const remove = (message: string) => {
        const index = this.pending.indexOf(entry);
        if (index < 0) return;
        this.pending.splice(index, 1);
        entry.cleanup();
        reject(new Error(message));
        this.pump();
      };
      const abort = () => remove("已取消排队");
      const timeout = setTimeout(() => remove("排队等待超时，请稍后再试"), this.maxWaitMs);
      const entry: Entry = { signal, update, resolve, reject, cleanup: () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); } };
      signal.addEventListener("abort", abort, { once: true });
      this.pending.push(entry);
      this.pump();
    });
  }

  private pump() {
    clearTimeout(this.timer);
    const now = Date.now();
    this.starts = this.starts.filter((start) => now - start < this.windowMs);
    while (this.pending.length && this.active < this.concurrency && this.starts.length < this.perMinute) {
      const entry = this.pending.shift()!;
      entry.cleanup();
      if (entry.signal.aborted) { entry.reject(new Error("已取消排队")); continue; }
      this.active++;
      this.starts.push(Date.now());
      entry.update({ status: "running", position: 0, waiting: this.pending.length, active: this.active });
      let released = false;
      entry.resolve(() => { if (!released) { released = true; this.active--; this.pump(); } });
    }
    this.pending.forEach((entry, index) => entry.update({ status: "waiting", position: index + 1, waiting: this.pending.length, active: this.active }));
    if (this.pending.length) {
      const delay = this.starts.length >= this.perMinute ? Math.max(1, this.starts[0] + this.windowMs - Date.now()) : 1000;
      this.timer = setTimeout(() => this.pump(), Math.min(delay, 1000));
    }
  }
}

export const chatQueue = new ChatQueue(env.chatConcurrency, env.chatRateLimit, env.chatQueueCapacity);
