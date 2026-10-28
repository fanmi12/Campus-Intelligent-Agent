import { env } from "./env";
export type QueueState = { status: "waiting" | "running"; position: number; waiting: number; active: number };
// 提问来源：client 是浏览器标识（同一 Wi-Fi 出口的同学互不影响），ip 是公网出口
export type QueueOwner = { client: string; ip: string };
export type QueueLimits = { perClient: number; perClientPerMinute: number; perIp: number };
type Entry = { signal: AbortSignal; update: (state: QueueState) => void; resolve: (release: () => void) => void; reject: (error: Error) => void; cleanup: () => void; free: () => void };

// 给同学看的排队提示（满员、提问过快等），接口原样展示
export class ChatQueueError extends Error {}

// 同一浏览器最多同时 2 个（停止后马上重问时，上一个可能还没释放）
const DEFAULT_LIMITS: QueueLimits = { perClient: 2, perClientPerMinute: 6, perIp: 40 };

// 单进程生产服务的 FIFO 队列；开始处理时计入滚动一分钟额度。
// 另按浏览器和公网出口限额，避免一个人连发或一台机器刷接口占满全站名额
export class ChatQueue {
  private pending: Entry[] = [];
  private active = 0;
  private starts: number[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  // 每个浏览器、每个出口正在排队或处理中的提问数；每个浏览器最近的提问时间
  private held = new Map<string, number>();
  private asked = new Map<string, number[]>();
  private readonly limits: QueueLimits;
  constructor(private concurrency = 5, private perMinute = 20, private capacity = 40, private windowMs = 60_000, private maxWaitMs = 180_000, limits: Partial<QueueLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  // 只判断能否接下这个提问，不占名额；接口在开始流式回答前先查，被拒时直接返回 429
  check(owner?: QueueOwner): string | null {
    if (this.pending.length >= this.capacity) return "排队人数已满，请稍后再试";
    if (!owner) return null;
    if (this.count(`client:${owner.client}`) >= this.limits.perClient) return "上一个问题还在回答，请稍等";
    if (this.recentAsks(owner.client).length >= this.limits.perClientPerMinute) return "提问有点快，请过一会儿再问";
    if (this.count(`ip:${owner.ip}`) >= this.limits.perIp) return "当前网络下提问的人太多，请稍后再试";
    return null;
  }

  acquire(signal: AbortSignal, update: Entry["update"], owner?: QueueOwner): Promise<() => void> {
    if (signal.aborted) return Promise.reject(new ChatQueueError("已取消排队"));
    const refused = this.check(owner);
    if (refused) return Promise.reject(new ChatQueueError(refused));
    const free = this.hold(owner);
    return new Promise((resolve, reject) => {
      const remove = (message: string) => {
        const index = this.pending.indexOf(entry);
        if (index < 0) return;
        this.pending.splice(index, 1);
        entry.cleanup();
        free();
        reject(new ChatQueueError(message));
        this.pump();
      };
      const abort = () => remove("已取消排队");
      const timeout = setTimeout(() => remove("排队等待超时，请稍后再试"), this.maxWaitMs);
      const entry: Entry = { signal, update, resolve, reject, free, cleanup: () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); } };
      signal.addEventListener("abort", abort, { once: true });
      this.pending.push(entry);
      this.pump();
    });
  }

  // 记下占用，返回只生效一次的归还函数
  private hold(owner?: QueueOwner): () => void {
    if (!owner) return () => {};
    const keys = [`client:${owner.client}`, `ip:${owner.ip}`];
    for (const key of keys) this.held.set(key, this.count(key) + 1);
    const now = Date.now();
    if (this.asked.size > 10_000) for (const client of [...this.asked.keys()]) this.recentAsks(client, now);
    this.asked.set(owner.client, [...this.recentAsks(owner.client, now), now]);
    let freed = false;
    return () => {
      if (freed) return;
      freed = true;
      for (const key of keys) {
        const left = this.count(key) - 1;
        if (left > 0) this.held.set(key, left);
        else this.held.delete(key);
      }
    };
  }

  private count(key: string): number {
    return this.held.get(key) ?? 0;
  }

  private recentAsks(client: string, now = Date.now()): number[] {
    const times = (this.asked.get(client) ?? []).filter((time) => now - time < this.windowMs);
    if (times.length) this.asked.set(client, times);
    else this.asked.delete(client);
    return times;
  }

  private pump() {
    clearTimeout(this.timer);
    const now = Date.now();
    this.starts = this.starts.filter((start) => now - start < this.windowMs);
    while (this.pending.length && this.active < this.concurrency && this.starts.length < this.perMinute) {
      const entry = this.pending.shift()!;
      entry.cleanup();
      if (entry.signal.aborted) { entry.free(); entry.reject(new ChatQueueError("已取消排队")); continue; }
      this.active++;
      this.starts.push(Date.now());
      entry.update({ status: "running", position: 0, waiting: this.pending.length, active: this.active });
      let released = false;
      entry.resolve(() => { if (!released) { released = true; this.active--; entry.free(); this.pump(); } });
    }
    this.pending.forEach((entry, index) => entry.update({ status: "waiting", position: index + 1, waiting: this.pending.length, active: this.active }));
    if (this.pending.length) {
      const delay = this.starts.length >= this.perMinute ? Math.max(1, this.starts[0] + this.windowMs - Date.now()) : 1000;
      this.timer = setTimeout(() => this.pump(), Math.min(delay, 1000));
    }
  }
}

export const chatQueue = new ChatQueue(env.chatConcurrency, env.chatRateLimit, env.chatQueueCapacity, 60_000, 180_000, {
  perClientPerMinute: env.chatClientRateLimit,
  perIp: env.chatIpActiveLimit,
});
