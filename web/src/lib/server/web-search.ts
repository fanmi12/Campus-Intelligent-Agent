import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { env } from "./env";

const API_BASE = "https://api.deepseek.com/v1/tools";
const TIMEOUT_MS = 20_000;
const resultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string().default(""),
  summary: z.string().default(""),
  site_name: z.string().nullable().default(null),
  date: z.string().nullable().default(null),
});
export type WebResult = z.infer<typeof resultSchema>;

export class WebSearchError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

function httpError(status: number): WebSearchError {
  const message = status === 401 ? "联网搜索鉴权失败，请检查 DeepSeek Key"
    : status === 402 ? "DeepSeek 余额不足，暂时无法联网查询"
    : status === 403 ? "该网页无法读取"
    : status === 404 ? "未能读取到该网页的正文"
    : status === 429 ? "联网查询繁忙，请稍后再试"
    : "联网查询暂时不可用，请稍后再试";
  return new WebSearchError(message, status);
}

// 只向 DeepSeek 固定端点发送 Key，网页 URL 作为 JSON 参数交给 Fetch API。
async function request(endpoint: "search" | "fetch", body: unknown, abortSignal?: AbortSignal): Promise<unknown> {
  const apiKey = env.webSearch.apiKey;
  if (!env.webSearch.enabled || !apiKey) throw new WebSearchError("未开启联网搜索");
  const signal = AbortSignal.any([...(abortSignal ? [abortSignal] : []), AbortSignal.timeout(TIMEOUT_MS)]);
  try {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (attempt === 0 && (response.status === 408 || response.status === 429 || response.status >= 500)) {
          await sleep(400, undefined, { signal });
          continue;
        }
        throw httpError(response.status);
      }
      return await response.json();
    }
  } catch (error) {
    abortSignal?.throwIfAborted();
    if (error instanceof WebSearchError) throw error;
    throw new WebSearchError(signal.aborted ? "联网查询超时，请稍后再试" : "联网查询暂时不可用，请稍后再试");
  }
}

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export async function searchWeb(query: string, count = 5, question?: string, signal?: AbortSignal): Promise<WebResult[]> {
  query = query.trim();
  if (!query || Array.from(query).length > 128 || !Number.isInteger(count) || count < 1 || count > 8) {
    throw new WebSearchError("搜索词需为 1～128 个字符，结果条数需为 1～8");
  }
  const original = Array.from(question?.trim() ?? "").slice(0, 128).join("");
  const data = await request("search", {
    query, count, need_content: false, ...(original ? { ori_question: original } : {}),
  }, signal);
  const parsed = z.object({ results: z.array(resultSchema) }).safeParse(data);
  if (!parsed.success) throw new WebSearchError("联网搜索返回的内容格式不正确");
  return parsed.data.results.filter((item) => isWebUrl(item.url)).slice(0, count).map((item) => ({
    ...item,
    title: item.title.slice(0, 300),
    snippet: item.snippet.slice(0, 600),
    summary: item.summary.slice(0, 1800),
  }));
}

export async function readWebPage(url: string, signal?: AbortSignal) {
  if (url.length > 8192 || !isWebUrl(url)) throw new WebSearchError("请提供不含用户名和密码的 HTTP/HTTPS 网页地址");
  const data = await request("fetch", { url }, signal);
  const parsed = z.object({ title: z.string(), content: z.string() }).safeParse(data);
  if (!parsed.success) throw new WebSearchError("网页正文返回的内容格式不正确");
  if (!parsed.data.content.trim()) throw new WebSearchError("该网页没有可读取的正文");
  return { title: parsed.data.title.slice(0, 300), content: parsed.data.content.slice(0, 16000) };
}
