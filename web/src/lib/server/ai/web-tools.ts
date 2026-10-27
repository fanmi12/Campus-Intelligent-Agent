import { tool } from "ai";
import { normalizeEvent, tools, type AppTools } from "@/lib/ai/tools";
import type { AppDataParts, SourceItem } from "@/lib/ai/types";
import type { ResultReference } from "@/lib/ai/result-schemas";
import { campusFoods } from "@/lib/campus-food";
import { ATTACHMENT_ONLY_NOTE } from "../kb/markdown";
import { hasWebSearch } from "../env";
import { readWebPage, searchWeb, WebSearchError } from "../web-search";

// 每次对话创建，来源编号、调用预算不会串到其他用户或并发请求。
export function createChatTools({
  question, sources, signal, onSources, onProgress, userEvidence = question, sourceContents,
}: {
  question: string;
  userEvidence?: string;
  sourceContents?: Map<number, string>;
  sources: SourceItem[];
  signal: AbortSignal;
  onSources: (trustedResult?: boolean) => void;
  onProgress: (id: string, data: AppDataParts["webSearch"]) => void;
}): AppTools {
  let calls = 0;
  function evidence(basis: "sources" | "user", numbers: number[]): { references: ResultReference[]; text: string } {
    signal.throwIfAborted();
    if (basis === "user") {
      if (!userEvidence.trim()) throw new Error("请先提供需要整理的具体内容。");
      return { references: [], text: userEvidence };
    }
    const selected = [...new Set(numbers)].map((n) => sources.find((source) => source.n === n));
    if (!selected.length || selected.some((source) => !source || source.snippet === ATTACHMENT_ONLY_NOTE)) throw new Error("缺少可读取的资料依据，请先查证或提供原文。");
    const verified = selected.filter((source): source is SourceItem => Boolean(source));
    return {
      references: verified.map((source) => ({ n: source.n, title: source.title, url: source.url && /^https?:\/\//.test(source.url) ? source.url : undefined, updated: source.updated })),
      text: verified.map((source) => sourceContents?.get(source.n) ?? source.snippet).join("\n"),
    };
  }
  function checkBudget() {
    signal.throwIfAborted();
    if (!hasWebSearch) throw new WebSearchError("未开启联网搜索");
    if (++calls > 4) throw new WebSearchError("本次联网查询次数已用完，请根据已有资料作答");
  }
  function register(item: Omit<SourceItem, "n" | "id">) {
    const pageKey = (value?: string) => {
      if (!value) return "";
      const url = new URL(value);
      url.hash = "";
      return url.href;
    };
    const existing = sources.find((source) => source.kind === "web" && pageKey(source.url) === pageKey(item.url));
    if (existing) {
      Object.assign(existing, item);
      return existing;
    }
    const source = { ...item, n: sources.length + 1, id: `web:${item.url}` };
    sources.push(source);
    return source;
  }
  function failed(id: string, action: "search" | "fetch", query: string, error: unknown) {
    signal.throwIfAborted();
    const message = error instanceof WebSearchError ? error.message : "联网查询暂时不可用，请稍后再试";
    onProgress(id, { status: "error", action, query, error: message });
    return message;
  }
  return {
    ...tools,
    recommendCampusFood: tool({
      ...tools.recommendCampusFood,
      execute: async ({ budget, category }) => {
        signal.throwIfAborted();
        const foods = campusFoods.map((food) => {
          let source = sources.find((item) => item.id === `food:${food.id}`);
          if (!source) {
            source = {
              n: sources.length + 1, id: `food:${food.id}`, title: `${food.name} · 餐饮历史资料`,
              snippet: `${food.dish}：${food.price === null ? "价格待核，不能判断是否符合预算" : `${food.price}元（历史参考）`}。${food.priceNote}。资料位置：${food.location}（现址待核）。${food.reviewSummary ? `历史个人评价：${food.reviewSummary}` : "暂未取得可对应的消费评价。"}${food.operationNote ?? "当前营业状态待核"}。`,
              url: food.source, updated: food.priceNote.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? food.photoDate ?? undefined, kind: "knowledge",
            };
            sources.push(source);
          }
          return { ...food, n: source.n };
        });
        onSources(true);
        return { foods, budget: budget ?? 20, category: category ?? "全部", references: foods.map((food) => ({ n: food.n, title: `${food.name} · 餐饮历史资料`, url: food.source, updated: food.priceNote.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? food.photoDate ?? undefined })) };
      },
    }),
    buildChecklist: tool({
      ...tools.buildChecklist,
      execute: async ({ sourceNumbers, ...data }) => ({ ...data, references: evidence(data.basis, sourceNumbers).references }),
    }),
    showContactCard: tool({
      ...tools.showContactCard,
      execute: async ({ sourceNumbers, ...data }) => {
        const proof = evidence(data.basis, sourceNumbers);
        const digits = proof.text.replace(/[^\d]/g, "");
        if (data.phones.some((phone) => !digits.includes(phone.number.replace(/[^\d]/g, "")))) throw new Error("资料中未找到该电话号码，请核对原文后再生成联系卡。");
        return { ...data, references: proof.references };
      },
    }),
    buildExamMemo: tool({
      ...tools.buildExamMemo,
      execute: async ({ event, checklist, basis, sourceNumbers }) => {
        const proof = evidence(basis, sourceNumbers);
        if (!/\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}[日号]?|今天|明天|后天|[下本这]周[一二三四五六日天]/.test(proof.text)) throw new Error("还缺少明确的考试日期，请提供考试通知或日期后再生成备忘卡。");
        return { event: { ...normalizeEvent({ ...event, kind: "exam" }, 0), kind: "exam" as const }, checklist, basis, references: proof.references };
      },
    }),
    searchWeb: tool({
      ...tools.searchWeb,
      execute: async ({ query, count }, { toolCallId }) => {
        try {
          checkBudget();
          onProgress(toolCallId, { status: "loading", action: "search", query });
          const results = await searchWeb(query, count, question, signal);
          const numbered = results.map((result) => {
            const source = register({
              title: result.title || "网页资料", url: result.url, kind: "web",
              snippet: result.summary || result.snippet, updated: result.date ?? undefined,
            });
            return { n: source.n, title: result.title, url: result.url, summary: result.summary || result.snippet, date: result.date, siteName: result.site_name };
          });
          if (numbered.length) onSources();
          onProgress(toolCallId, { status: "done", action: "search", query, count: numbered.length });
          return { results: numbered };
        } catch (error) {
          return { results: [], error: failed(toolCallId, "search", query, error) };
        }
      },
    }),
    readWebPage: tool({
      ...tools.readWebPage,
      execute: async ({ url }, { toolCallId }) => {
        try {
          checkBudget();
          onProgress(toolCallId, { status: "loading", action: "fetch", query: url });
          const page = await readWebPage(url, signal);
          const source = register({ title: page.title || "网页资料", url, snippet: page.content.slice(0, 1800), kind: "web" });
          onSources();
          onProgress(toolCallId, { status: "done", action: "fetch", query: url, count: 1 });
          return { n: source.n, url, ...page };
        } catch (error) {
          return { url, title: "", content: "", error: failed(toolCallId, "fetch", url, error) };
        }
      },
    }),
  };
}
