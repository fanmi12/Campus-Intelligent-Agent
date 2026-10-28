import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { ChatQueue, ChatQueueError, type QueueState } from "../src/lib/server/chat-queue";

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

  // 按浏览器、出口 IP 限额：同一 Wi-Fi 下不同浏览器互不影响，一个人连发会被拦下
  const signal = () => new AbortController().signal;
  const limited = new ChatQueue(5, 100, 10, 200, 500, { perClient: 1, perClientPerMinute: 2, perIp: 2 });
  // 用 RFC 5737 文档示例地址，避免公开仓库检查误报
  const a = { client: "client-a", ip: "192.0.2.1" };
  const b = { client: "client-b", ip: "192.0.2.1" };
  const c = { client: "client-c", ip: "192.0.2.1" };
  const d = { client: "client-d", ip: "198.51.100.2" };
  const releaseA = await limited.acquire(signal(), () => {}, a);
  assert.match(limited.check(a) ?? "", /还在回答/);
  await assert.rejects(limited.acquire(signal(), () => {}, a), (error) => error instanceof ChatQueueError && /还在回答/.test(error.message));
  const releaseB = await limited.acquire(signal(), () => {}, b);
  assert.match(limited.check(c) ?? "", /网络/, "同一出口同时处理数到上限");
  const releaseD = await limited.acquire(signal(), () => {}, d);
  releaseA();
  releaseA();
  assert.equal(limited.check(c), null, "归还后同一出口的其他浏览器可以提问");
  (await limited.acquire(signal(), () => {}, a))();
  assert.match(limited.check(a) ?? "", /有点快/, "一分钟内提问次数到上限");
  await assert.rejects(limited.acquire(signal(), () => {}, a), /有点快/);
  releaseB();
  releaseD();
  await sleep(220);
  assert.equal(limited.check(a), null, "滚动窗口过后恢复");

  // 排队中取消、超时都要归还名额
  const single = new ChatQueue(1, 100, 5, 200, 60, { perClient: 1, perClientPerMinute: 10, perIp: 10 });
  const running = await single.acquire(signal(), () => {}, d);
  const cancel = new AbortController();
  const waiting = assert.rejects(single.acquire(cancel.signal, () => {}, a), /取消/);
  assert.match(single.check(a) ?? "", /还在回答/);
  cancel.abort();
  await waiting;
  assert.equal(single.check(a), null);
  await assert.rejects(single.acquire(signal(), () => {}, b), /超时/);
  assert.equal(single.check(b), null);
  running();
  console.log("PASS: concurrency, FIFO, capacity, cancellation, rate window, timeout, idempotent release, per-client/IP limits");
}
void main();
