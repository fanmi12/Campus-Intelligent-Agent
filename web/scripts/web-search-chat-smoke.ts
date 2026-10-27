import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppUIMessage, SourceItem } from "../src/lib/ai/types";

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3101").replace(/\/$/, "");
  const question = process.argv[3] ?? "请联网查一下东莞城市学院最近有什么通知，给我一个官网原文链接；旧通知请标明日期。";
  const started = Date.now();
  const status = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(15_000) }).then((response) => response.json());
  assert.equal(status.webSearch, true, "状态接口未启用联网");
  const response = await fetch(`${base}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: `search-smoke-${Date.now()}`, messages: [{ id: `user-${Date.now()}`, role: "user", parts: [{ type: "text", text: question }] }] satisfies AppUIMessage[] }),
    signal: AbortSignal.timeout(120_000),
  });
  assert.ok(response.ok, `聊天接口返回 ${response.status}`);
  const body = await response.text();
  const events = body.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
  const errors = events.filter((event) => event.type === "error" || event.type === "tool-output-error");
  assert.deepEqual(errors, []);
  assert.ok(body.includes("data: [DONE]"), "对话流未正常结束");
  const steps = events.filter((event) => event.type === "data-webSearch").map((event) => event.data);
  const sources: SourceItem[] = events.filter((event) => event.type === "data-sources").at(-1)?.data.items ?? [];
  const answer = events.filter((event) => event.type === "text-delta").map((event) => event.delta).join("");
  assert.ok(steps.some((step) => step.action === "search" && step.status === "done" && step.count > 0), "模型未完成真实搜索");
  const webSources = sources.filter((source) => source.kind === "web");
  assert.ok(webSources.length > 0, "未收到联网出处");
  assert.ok(webSources.some((source) => answer.includes(`[${source.n}]`)), "回答未引用联网出处编号");
  assert.ok(answer.trim(), "工具调用后没有回答");
  const evidence = { base, question, status, steps, sources, answer, durationMs: Date.now() - started, checkedAt: new Date().toISOString() };
  const output = path.resolve("../outputs/web-search");
  await mkdir(output, { recursive: true });
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname);
  await writeFile(path.join(output, local ? "chat-local.json" : "chat-live.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ base, steps, sources: sources.length, webSources: webSources.length, answer, durationMs: evidence.durationMs }, null, 2));
}
void main();
