import path from "node:path";

// 只在服务端使用：读取环境变量（.env.local 或服务器上的 .env）
function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readNumber(name: string, fallback: number): number {
  const value = Number(read(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// JSON 对象形式的配置，格式不对就忽略并提示
function readObject(name: string): Record<string, unknown> | undefined {
  const value = read(name);
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // 下面统一提示
  }
  console.error(`[env] ${name} 不是 JSON 对象，已忽略`);
  return undefined;
}

const llmBaseURL = read("LLM_BASE_URL");
const llmApiKey = read("LLM_API_KEY");
// 附加到对话请求里的参数，用来开关各家模型的特有功能（如 DeepSeek 的思考模式）
const llmExtraBody = readObject("LLM_EXTRA_BODY");
const embeddingBaseURL = read("EMBEDDING_BASE_URL") ?? llmBaseURL;
const embeddingApiKey = read("EMBEDDING_API_KEY") ?? llmApiKey;
// 只有对话接口确实指向 DeepSeek 官方时才复用 Key，切换模型服务商不会误用其他家的 Key。
const usesDeepSeek = (() => {
  try { return new URL(llmBaseURL ?? "").origin === "https://api.deepseek.com"; }
  catch { return false; }
})();

export const env = {
  amap: {
    key: read("AMAP_JS_API_KEY"),
    securityCode: read("AMAP_SECURITY_JSCODE"),
  },
  webSearch: {
    enabled: read("WEB_SEARCH_ENABLED") !== "false",
    apiKey: read("DEEPSEEK_SEARCH_API_KEY") ?? (usesDeepSeek ? llmApiKey : undefined),
  },
  llm: {
    baseURL: llmBaseURL,
    apiKey: llmApiKey,
    model: read("LLM_MODEL"),
    extraBody: llmExtraBody,
  },
  vision: {
    baseURL: read("VISION_BASE_URL") ?? llmBaseURL,
    apiKey: read("VISION_API_KEY") ?? llmApiKey,
    model: read("VISION_MODEL"),
    // 和对话模型同一个服务商时，沿用对话模型的附加参数
    extraBody: readObject("VISION_EXTRA_BODY") ?? (read("VISION_BASE_URL") ? undefined : llmExtraBody),
  },
  embedding: {
    baseURL: embeddingBaseURL,
    apiKey: embeddingApiKey,
    model: read("EMBEDDING_MODEL"),
    // 一次请求最多送几段：硅基流动可以 32 段，阿里云百炼最多 10 段
    batchSize: readNumber("EMBEDDING_BATCH_SIZE", embeddingBaseURL?.includes("siliconflow") ? 32 : 10),
  },
  // 重排模型：默认和嵌入模型用同一个服务商
  rerank: {
    baseURL: read("RERANK_BASE_URL") ?? embeddingBaseURL,
    apiKey: read("RERANK_API_KEY") ?? embeddingApiKey,
    model: read("RERANK_MODEL"),
  },
  // 重排得分低于这个值，判定为"资料里没有答案"
  rerankMinScore: readNumber("RERANK_MIN_SCORE", 0.3),
  adminPassword: read("ADMIN_PASSWORD"),
  dataDir: path.resolve(/* turbopackIgnore: true */ read("DATA_DIR") ?? "data"),
  knowledgeDir: path.resolve(/* turbopackIgnore: true */ read("KNOWLEDGE_DIR") ?? "knowledge"),
  // 语义相似度低于这个值、关键词也对不上时，判定为"资料里没有"
  kbMinSimilarity: readNumber("KB_MIN_SIMILARITY", 0.45),
  // 全站滚动一分钟最多启动的提问数
  chatRateLimit: Math.floor(readNumber("CHAT_RATE_LIMIT", 20)),
  chatConcurrency: Math.floor(readNumber("CHAT_CONCURRENCY", 5)),
  chatQueueCapacity: Math.floor(readNumber("CHAT_QUEUE_CAPACITY", 40)),
};

// 没配置大模型时进入演示模式：不调用任何外部接口，用模拟回复跑通界面
export const isDemoMode = !env.llm.baseURL || !env.llm.apiKey || !env.llm.model;
export const hasVision = !isDemoMode && Boolean(env.vision.baseURL && env.vision.apiKey && env.vision.model);
export const hasEmbedding = Boolean(env.embedding.baseURL && env.embedding.apiKey && env.embedding.model);
export const hasRerank = Boolean(env.rerank.baseURL && env.rerank.apiKey && env.rerank.model);
export const hasWebSearch = !isDemoMode && env.webSearch.enabled && Boolean(env.webSearch.apiKey);
