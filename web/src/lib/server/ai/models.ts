import { setTimeout as sleep } from "node:timers/promises";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany, type EmbeddingModel, type LanguageModel } from "ai";
import { env } from "../env";

// 所有模型都走 OpenAI 兼容接口：阿里云百炼、DeepSeek、硅基流动、火山方舟等都能用。
// extraBody 会原样合并进请求体，用来开关各家的特有参数
function createProvider(name: string, baseURL: string, apiKey: string, extraBody?: Record<string, unknown>) {
  return createOpenAICompatible({
    name,
    baseURL,
    apiKey,
    includeUsage: true,
    transformRequestBody: extraBody ? (body) => ({ ...body, ...extraBody }) : undefined,
  });
}

export function getChatModel(): LanguageModel | null {
  const { baseURL, apiKey, model, extraBody } = env.llm;
  if (!baseURL || !apiKey || !model) return null;
  return createProvider("llm", baseURL, apiKey, extraBody).chatModel(model);
}

export function getVisionModel(): LanguageModel | null {
  const { baseURL, apiKey, model, extraBody } = env.vision;
  if (!baseURL || !apiKey || !model) return null;
  return createProvider("vision", baseURL, apiKey, extraBody).chatModel(model);
}

export function getEmbeddingModel(): EmbeddingModel | null {
  const { baseURL, apiKey, model } = env.embedding;
  if (!baseURL || !apiKey || !model) return null;
  return createProvider("embedding", baseURL, apiKey).embeddingModel(model);
}

// 批量算资料向量：每批 batchSize 段，最多同时发 concurrency 个请求，每算完一批就回调一次（方便边算边存）
export async function embedInBatches<T>(
  model: EmbeddingModel,
  items: T[],
  text: (item: T) => string,
  onBatch: (batch: T[], vectors: number[][]) => void,
  concurrency = 3,
): Promise<void> {
  const size = env.embedding.batchSize;
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const { embeddings } = await embedMany({ model, values: batch.map(text), maxRetries: 4 });
      onBatch(batch, embeddings);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
}

// Qwen3 嵌入模型给问题加上任务说明效果更好（资料本身不加）
function queryText(query: string): string {
  return /qwen3-embedding/i.test(env.embedding.model ?? "")
    ? `Instruct: Given a question from a university student, retrieve campus documents that answer it\nQuery: ${query}`
    : query;
}

// 同一上游正在等待返回的请求数。多人同时提问时上游本来就在排队，再补发对冲请求只会更慢，
// 所以超过 hedgeBelow 个就不再补发
type Lane = { inflight: number; hedgeBelow: number };
const embeddingLane: Lane = { inflight: 0, hedgeBelow: 6 };
const rerankLane: Lane = { inflight: 0, hedgeBelow: 12 };

// 对冲请求：第一个请求 delayMs 毫秒没返回就再发一个相同的，谁先返回用谁，最多 attempts 个；
// 总共限时 timeoutMs，到时间就放弃（不依赖底层请求是否响应取消）。有返回后取消其余请求
async function hedged<T>(
  run: (signal: AbortSignal) => Promise<T>,
  { delayMs, attempts, timeoutMs }: { delayMs: number; attempts: number; timeoutMs: number },
  lane: Lane,
): Promise<T> {
  const done = new AbortController();
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([done.signal, timeout]);
  const timedOut = new Promise<never>((_, reject) => {
    timeout.addEventListener("abort", () => reject(new Error(`超过 ${timeoutMs / 1000} 秒没有返回`)), { once: true });
  });
  const attempt = async (index: number) => {
    if (index) {
      await sleep(index * delayMs, undefined, { signal });
      if (lane.inflight >= lane.hedgeBelow) throw new Error("上游繁忙，不再补发");
    }
    lane.inflight++;
    try {
      return await run(signal);
    } finally {
      lane.inflight--;
    }
  };
  try {
    return await Promise.race([Promise.any(Array.from({ length: attempts }, (_, index) => attempt(index))), timedOut]);
  } catch (error) {
    throw error instanceof AggregateError ? error.errors[0] : error;
  } finally {
    done.abort();
  }
}

const queryCache = new Map<string, number[]>();

// 提问时算问题的向量。有的服务商偶尔要排队好几秒（实测硅基流动的 8B 模型约三成请求超过 2 秒）：
// 0.5 秒没返回就补发，谁先返回用谁（问题只有几十个 token，多发几次的费用可以忽略）。
// 总共限时 4 秒，超时就只用关键词检索。常见问题缓存起来
export async function embedQuery(model: EmbeddingModel, query: string): Promise<number[]> {
  const key = query.trim();
  const cached = queryCache.get(key);
  if (cached) return cached;
  const vector = await hedged(
    async (signal) => {
      const { embeddings } = await embedMany({ model, values: [queryText(key)], maxRetries: 0, abortSignal: signal });
      return embeddings[0];
    },
    { delayMs: 500, attempts: 4, timeoutMs: 4000 },
    embeddingLane,
  );
  if (queryCache.size >= 500) queryCache.delete(queryCache.keys().next().value as string);
  queryCache.set(key, vector);
  return vector;
}

export type RerankResult = { index: number; score: number };

const RERANK_BATCH = 10;

// 重排：把候选资料和问题逐条比对打分（硅基流动、Jina、Cohere 通用的 /rerank 接口格式）。
// 每条的分数互不影响，所以拆成每批 10 条并行发送（实测 30 条一次发约 1.6 秒，拆开约 1.1 秒）；
// 某一批 1 秒没返回就补发一次（正常 0.3～1 秒），避免偶尔排队拖慢整个回答
export async function rerank(query: string, documents: string[]): Promise<RerankResult[] | null> {
  const { baseURL, apiKey, model } = env.rerank;
  if (!baseURL || !apiKey || !model || !documents.length) return null;
  const rerankBatch = async (start: number, signal: AbortSignal): Promise<RerankResult[]> => {
    const batch = documents.slice(start, start + RERANK_BATCH);
    const response = await fetch(`${baseURL.replace(/\/+$/, "")}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, query, documents: batch, top_n: batch.length, return_documents: false }),
      signal,
    });
    if (!response.ok) throw new Error(`重排接口返回 ${response.status}：${(await response.text()).slice(0, 200)}`);
    const data = (await response.json()) as { results?: { index: number; relevance_score: number }[] };
    return (data.results ?? []).map((item) => ({ index: start + item.index, score: item.relevance_score }));
  };
  const starts = Array.from({ length: Math.ceil(documents.length / RERANK_BATCH) }, (_, i) => i * RERANK_BATCH);
  const batches = await Promise.all(
    starts.map((start) =>
      hedged((signal) => rerankBatch(start, signal), { delayMs: 1000, attempts: 2, timeoutMs: 6000 }, rerankLane),
    ),
  );
  return batches.flat();
}
