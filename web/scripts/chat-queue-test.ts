import assert from "node:assert/strict";
import { ChatQueue, type QueueState } from "../src/lib/server/chat-queue";

async function main() {
  const queue = new ChatQueue(1, 2, 2, 120, 500);
  const controller = new AbortController();
  const states: QueueState[] = [];
  const first = await queue.acquire(new AbortController().signal, () => {});
  let secondStarted = false;
  const second = queue.acquire(new AbortController().signal, (s) => { states.push(s); if (s.status === "running") secondStarted = true; });
  const cancelled = queue.acquire(controller.signal, () => {});
  const cancelledCheck = assert.rejects(cancelled, /取消/);
  await assert.rejects(queue.acquire(new AbortController().signal, () => {}), /已满/);
  assert.equal(secondStarted, false);
  controller.abort();
  await cancelledCheck;
  first(); first(); // 重复释放不能误减活动数。
  const releaseSecond = await second;
  assert.equal(states[0].position, 1);
  assert.equal(secondStarted, true);
  releaseSecond();
  const start = Date.now();
  const third = await queue.acquire(new AbortController().signal, () => {});
  assert.ok(Date.now() - start >= 60, "滚动窗口额度耗尽时不能提前运行");
  third();
  const timeoutQueue = new ChatQueue(1, 20, 2, 100, 20);
  const held = await timeoutQueue.acquire(new AbortController().signal, () => {});
  await assert.rejects(timeoutQueue.acquire(new AbortController().signal, () => {}), /超时/);
  held();
  console.log("PASS: concurrency, FIFO, capacity, cancellation, rate window, timeout, idempotent release");
}
void main();
