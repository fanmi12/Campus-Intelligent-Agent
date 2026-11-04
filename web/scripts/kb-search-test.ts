import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// 检索行为：问题向量和重排的等待时机、2015 年前的旧新闻不参与检索。
// 用临时数据库和本地模拟的向量、重排接口（可调延迟、可让重排失败），不碰正式数据，不调用真实模型。
// 模拟的向量按文字提到哪些地点来定；重排分数看资料是否讲到问题里问的地点
const PLACES = [/图书馆|library/i, /饭堂|canteen/i];
const vectorOf = (text: string) => [...PLACES.map((place) => (place.test(text) ? 1 : 0)), 0.1];
const OLD_NEWS = "图书馆今起延长开放时间";
const NEWER_NEWS = "图书馆新增一批阅览座位";

type RerankPlan = (documents: string[]) => { delayMs: number; fail?: boolean };
const upstream: { queryEmbedMs: number; rerank: RerankPlan } = { queryEmbedMs: 0, rerank: () => ({ delayMs: 0 }) };

function startUpstream(): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    const reply = (status: number, json: unknown) => {
      if (res.destroyed) return;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.url?.endsWith("/embeddings")) {
      const inputs: string[] = Array.isArray(data.input) ? data.input : [data.input];
      // 导入资料时一批多段，每段都带换行；提问时只有一句问题，只给它加延迟
      if (inputs.length === 1 && !inputs[0].includes("\n")) await sleep(upstream.queryEmbedMs);
      return reply(200, { data: inputs.map((text) => ({ embedding: vectorOf(text) })) });
    }
    if (req.url?.endsWith("/rerank")) {
      const documents: string[] = data.documents;
      const { delayMs, fail } = upstream.rerank(documents);
      await sleep(delayMs);
      if (fail) return reply(500, { error: "模拟的重排故障" });
      const asked = PLACES.filter((place) => place.test(data.query));
      return reply(200, {
        results: documents.map((doc, index) => ({ index, relevance_score: asked.some((place) => place.test(doc)) ? 0.9 : 0.01 })),
      });
    }
    reply(404, {});
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kb-search-"));
  const knowledge = path.join(scratch, "knowledge");
  const news = path.join(knowledge, "官网", "05-学校要闻");
  fs.mkdirSync(news, { recursive: true });
  fs.writeFileSync(path.join(knowledge, "图书馆.md"), "---\ntitle: 图书馆\n---\n\n## 开放时间\n\n图书馆每天 8:00 至 22:00 开放。\n");
  fs.writeFileSync(path.join(knowledge, "饭堂.md"), "---\ntitle: 饭堂\n---\n\n## 营业时间\n\n饭堂早餐 7:00 开始供应。\n");
  const newsDoc = (title: string, updated: string, text: string) =>
    `---\ntitle: ${title}\ncategory: 学校要闻\nkind: 新闻\nupdated: ${updated}\n---\n\n${text}\n`;
  fs.writeFileSync(path.join(news, "2009-03-26_旧闻.md"), newsDoc(OLD_NEWS, "2009-03-26", "图书馆今起延长开放时间至 23:00。"));
  fs.writeFileSync(path.join(news, "2016-09-01_新闻.md"), newsDoc(NEWER_NEWS, "2016-09-01", "图书馆新增一批阅览座位，开放时间不变。"));

  const server = await startUpstream();
  const { port } = server.address() as { port: number };
  process.env.DATA_DIR = path.join(scratch, "data");
  process.env.KNOWLEDGE_DIR = knowledge;
  for (const name of ["LLM_BASE_URL", "LLM_API_KEY", "RERANK_BASE_URL", "RERANK_API_KEY"]) delete process.env[name];
  process.env.EMBEDDING_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.EMBEDDING_API_KEY = "test";
  process.env.EMBEDDING_MODEL = "mock-embedding";
  process.env.RERANK_MODEL = "mock-rerank";

  const { ingestKnowledge } = await import("../src/lib/server/kb/ingest");
  const { searchKnowledge } = await import("../src/lib/server/kb/search");
  await ingestKnowledge();
  const titles = (result: Awaited<ReturnType<typeof searchKnowledge>>) => result.hits.map((hit) => hit.chunk.docTitle);

  // 1. 关键词一个都对不上（英文提问），向量 0.9 秒才回来：要等到向量，不能直接判为没有资料；
  //    这时只有语义检索，旧新闻也不能从向量这条路混进来
  upstream.queryEmbedMs = 900;
  const english = await searchKnowledge("library opening hours?");
  assert.equal(titles(english)[0], "图书馆", "关键词没命中时等到问题的向量");
  assert.equal(english.lowConfidence, false);
  assert.ok(!titles(english).includes(OLD_NEWS), "2015 年前的新闻不进语义检索");

  // 2. 关键词只找到饭堂，第一批重排很快完成，向量 1.2 秒才回来：语义检索找到的图书馆也要补上
  upstream.queryEmbedMs = 1200;
  upstream.rerank = () => ({ delayMs: 50 });
  const late = await searchKnowledge("饭堂旁边的 library");
  assert.ok(titles(late).includes("饭堂"));
  assert.ok(titles(late).includes("图书馆"), "向量稍晚（2 秒内）也要用上语义检索");

  // 3. 关键词只找到不相关的饭堂（重排分数很低），向量 2.5 秒才回来：超过 2 秒也要等，否则只能答"没有资料"
  upstream.queryEmbedMs = 2500;
  const irrelevant = await searchKnowledge("library 早餐");
  assert.equal(titles(irrelevant)[0], "图书馆", "关键词找到的都不相关时等到问题的向量");

  // 4. 第一批重排（饭堂）一直失败，第二批（图书馆）要 4 秒：第一批失败后直接用粗排结果，不等第二批
  upstream.queryEmbedMs = 0;
  upstream.rerank = (documents) => (documents.some((doc) => doc.includes("饭堂")) ? { delayMs: 0, fail: true } : { delayMs: 4000 });
  const started = performance.now();
  const degraded = await searchKnowledge("饭堂附近的 library");
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 3500, `第一批重排失败后不再等第二批（实际 ${Math.round(elapsed)}ms）`);
  assert.ok(degraded.hits.length > 0 && degraded.hits.every((hit) => hit.relevance === null), "重排失败时用粗排结果");

  // 5. 中文提问时关键词和语义两条路都能找到旧新闻：2015 年前的不出现，之后的新闻照常可用
  upstream.rerank = () => ({ delayMs: 0 });
  const chinese = await searchKnowledge("图书馆开放时间");
  assert.ok(!titles(chinese).includes(OLD_NEWS), "2015 年前的新闻不进关键词检索");
  assert.ok(titles(chinese).includes(NEWER_NEWS), "2015 年以后的新闻照常检索");

  server.closeAllConnections();
  server.close();
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch {
    // Windows 上数据库文件仍被占用时留给系统清理临时目录
  }
  console.log("PASS: search waits for a late query vector (always when keyword hits are missing or irrelevant, else up to 2 s), falls back without waiting when the first rerank fails, and leaves out pre-2015 news");
}
void main();
