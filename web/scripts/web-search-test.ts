import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// 隔离于真实 Key；全部协议测试只走内存中的 fetch 替身。
process.env.LLM_BASE_URL = "https://api.deepseek.com";
process.env.LLM_API_KEY = "test-deepseek-key";
process.env.LLM_MODEL = "test-model";
delete process.env.DEEPSEEK_SEARCH_API_KEY;
delete process.env.WEB_SEARCH_ENABLED;

async function main() {
  const { searchWeb, readWebPage } = await import("../src/lib/server/web-search");
  const { createChatTools } = await import("../src/lib/server/ai/web-tools");
  const { tools } = await import("../src/lib/ai/tools");
  const { buildInstructions } = await import("../src/lib/server/ai/prompt");
  const { formatAnswerCitations } = await import("../src/lib/ai/citations");
  const originalFetch = globalThis.fetch;
  const requests: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  let respond: () => Response = () => Response.json({ results: [] });
  globalThis.fetch = async (input, init = {}) => {
    init.signal?.throwIfAborted();
    requests.push({ url: String(input), init, body: JSON.parse(String(init.body)) });
    return respond();
  };
  const row = { title: "本校通知", url: "https://www.dgcu.edu.cn/newsview/1.html", snippet: "摘要", summary: "最新官方通知", site_name: "学校官网", date: "2026-10-26T00:00:00Z" };
  const citation = [{ n: 6, id: "web-6", title: row.title, snippet: row.summary, url: row.url }];
  assert.equal(formatAnswerCitations(`来源：${row.url} [6]`, citation), "来源：[6]");
  assert.equal(formatAnswerCitations(`[官网](${row.url}#1)`, citation), "[6]");
  assert.equal(formatAnswerCitations(`<${row.url}>`, citation), "[6]");
  assert.equal(formatAnswerCitations("已有编号 [1][2]。", citation), "已有编号 [1][2]。");
  assert.equal(formatAnswerCitations("https://invented.example.com/", citation), "");
  try {
    respond = () => Response.json({ results: [row, { ...row, url: "javascript:alert(1)" }] });
    const results = await searchWeb("  校历 site:dgcu.edu.cn  ", 5, "😀".repeat(140));
    assert.equal(results.length, 1);
    assert.equal(requests[0].url, "https://api.deepseek.com/v1/tools/search");
    assert.deepEqual(requests[0].body, { query: "校历 site:dgcu.edu.cn", count: 5, need_content: false, ori_question: "😀".repeat(128) });
    assert.equal(new Headers(requests[0].init.headers).get("Authorization"), "Bearer test-deepseek-key");
    assert.equal(requests[0].init.redirect, "error");
    assert.equal(requests[0].init.cache, "no-store");
    await searchWeb("😀".repeat(128));
    await assert.rejects(searchWeb("😀".repeat(129)), /128/);
    await assert.rejects(searchWeb("  "), /128/);
    await assert.rejects(searchWeb("校历", 50), /1～8/);
    const querySchema = tools.searchWeb.inputSchema as { safeParse: (input: unknown) => { success: boolean } };
    assert.equal(querySchema.safeParse({ query: "😀".repeat(128) }).success, true);
    assert.equal(querySchema.safeParse({ query: "😀".repeat(129) }).success, false);

    respond = () => Response.json({ title: "本校校历", content: "文".repeat(20000) });
    const page = await readWebPage(row.url);
    assert.equal(page.content.length, 16000);
    assert.equal(requests.at(-1)?.url, "https://api.deepseek.com/v1/tools/fetch");
    assert.deepEqual(requests.at(-1)?.body, { url: row.url });
    const beforeInvalid = requests.length;
    for (const url of ["file:///etc/passwd", "https://user:pass@example.com/", "no-url"]) {
      await assert.rejects(readWebPage(url), /HTTP\/HTTPS/);
    }
    assert.equal(requests.length, beforeInvalid);
    respond = () => Response.json({ title: "空页面", content: "" });
    await assert.rejects(readWebPage(row.url), /正文/);

    for (const status of [400, 401, 402, 403, 404]) {
      const before = requests.length;
      respond = () => Response.json({ error: { message: "SENSITIVE_UPSTREAM_DETAILS" } }, { status });
      await assert.rejects(searchWeb("测试"), (error: Error) => !error.message.includes("SENSITIVE") && Boolean(error.message));
      assert.equal(requests.length - before, 1, `HTTP ${status} 不应重试`);
    }
    for (const status of [408, 429, 500, 504]) {
      const before = requests.length;
      respond = () => requests.length - before === 1 ? new Response(null, { status }) : Response.json({ results: [] });
      assert.deepEqual(await searchWeb("测试"), []);
      assert.equal(requests.length - before, 2);
    }
    const beforeRepeatedError = requests.length;
    respond = () => new Response(null, { status: 500 });
    await assert.rejects(searchWeb("测试"), /暂时不可用/);
    assert.equal(requests.length - beforeRepeatedError, 2);
    respond = () => Response.json({ results: "wrong shape" });
    await assert.rejects(searchWeb("测试"), /格式不正确/);
    const aborted = new AbortController();
    aborted.abort();
    const beforeAbort = requests.length;
    await assert.rejects(searchWeb("测试", 5, undefined, aborted.signal));
    assert.equal(requests.length, beforeAbort);

    const originalTimeout = AbortSignal.timeout;
    try {
      AbortSignal.timeout = () => originalTimeout(10);
      globalThis.fetch = async (_, init) => new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
      // AbortSignal.timeout 的定时器不保持 Node 事件循环，给此检查单独保活。
      const keepAlive = setTimeout(() => {}, 1000);
      try { await assert.rejects(searchWeb("测试超时"), /超时/); }
      finally { clearTimeout(keepAlive); }
    } finally { AbortSignal.timeout = originalTimeout; }
    globalThis.fetch = async (input, init = {}) => {
      init.signal?.throwIfAborted();
      requests.push({ url: String(input), init, body: JSON.parse(String(init.body)) });
      return respond();
    };

    // 工具层：并发搜索编号不冲突、同 URL 去重、读取正文更新出处、错误可继续作答。
    const sources: import("../src/lib/ai/types").SourceItem[] = [{ n: 1, id: "kb-1", title: "知识库", snippet: "资料", url: row.url, kind: "knowledge" }];
    const progress: import("../src/lib/ai/types").AppDataParts["webSearch"][] = [];
    let updates = 0;
    const chatTools = createChatTools({ question: "最新校历", sources, signal: new AbortController().signal, onSources: () => { updates++; }, onProgress: (_, data) => progress.push(data) });
    respond = () => Response.json({ results: [row] });
    const options = { toolCallId: "test", messages: [], context: undefined };
    await Promise.all([
      chatTools.searchWeb.execute!({ query: "本校校历" }, options),
      chatTools.searchWeb.execute!({ query: "本校通知" }, options),
    ]);
    assert.equal(sources.length, 2);
    assert.equal(sources[1].n, 2);
    assert.equal(sources[1].kind, "web");
    respond = () => Response.json({ title: "校历正文", content: "校历全文" });
    await chatTools.readWebPage.execute!({ url: `${row.url}#section` }, options);
    assert.equal(sources[1].snippet, "校历全文");
    assert.equal(sources[1].updated, row.date);
    assert.equal(sources.length, 2);
    respond = () => new Response(null, { status: 402 });
    const failure = await chatTools.searchWeb.execute!({ query: "测试" }, options);
    assert.ok(failure && "error" in failure && failure.error?.includes("余额"));
    const beforeBudget = requests.length;
    const exhausted = await chatTools.searchWeb.execute!({ query: "测试" }, options);
    assert.ok(exhausted && "error" in exhausted && exhausted.error?.includes("次数"));
    assert.equal(requests.length, beforeBudget);
    assert.equal(updates, 3);
    assert.ok(progress.some((data) => data.status === "loading"));
    assert.ok(progress.some((data) => data.status === "done"));
    assert.ok(progress.some((data) => data.status === "error"));
    const enabledPrompt = buildInstructions({ sources: [], lowConfidence: true, webSearch: true });
    assert.ok(enabledPrompt.includes("必须先调用 searchWeb"));
    assert.ok(enabledPrompt.includes("site:dgcu.edu.cn"));
    assert.ok(buildInstructions({ sources: [], lowConfidence: true }).includes("本轮未开启联网查询"));

    // 配置独立进程验证：官方 /v1 地址可复用 Key，其他服务商不复用，关闭/演示状态生效。
    for (const [base, key, enabled, model, expected] of [
      ["https://api.deepseek.com/v1", "", "true", "test", true],
      ["https://other.example.com", "", "true", "test", false],
      ["https://other.example.com", "separate-key", "true", "test", true],
      ["https://api.deepseek.com", "", "false", "test", false],
      ["https://api.deepseek.com", "", "true", "", false],
    ] as const) {
      const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "const m = await import('./src/lib/server/env.ts'); console.log((m.default ?? m).hasWebSearch)"], {
        env: { ...process.env, LLM_BASE_URL: base, DEEPSEEK_SEARCH_API_KEY: key, WEB_SEARCH_ENABLED: enabled, LLM_MODEL: model }, encoding: "utf8",
      });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stdout.trim(), String(expected));
    }
    console.log("PASS: Search/Fetch 协议、Unicode 限制、来源编号与去重、错误与重试、取消、调用预算、启用/关闭/演示配置");
  } finally { globalThis.fetch = originalFetch; }
}
void main();
