import type { Grounding, LessonSource, RequestedGrounding } from "@/lib/learn/schema";
import { ATTACHMENT_ONLY_NOTE } from "../kb/markdown";
import { searchKnowledge, type SearchResult } from "../kb/search";
import type { PromptSource } from "./prompts";

// 课程的依据：学习者自己的资料 > 校园资料 > 通用知识。
// 校园课程整节都靠资料，所以采用资料的门槛比聊天（0.3）更严：弱相关宁可按通用知识讲，也不要把无关资料当依据

export const CAMPUS_MIN_SCORE = 0.5;
const SEARCH_LIMIT = 8;
// 公开返回给前端的片段长度；提示词里每条的长度上限见 prompts.ts
const SNIPPET_CHARS = 600;

export type KnowledgeSearch = (query: string, limit?: number) => Promise<SearchResult>;

export type ResolvedGrounding = {
  grounding: Grounding;
  sources: LessonSource[];
  promptSources: PromptSource[];
};

const none = (grounding: Grounding): ResolvedGrounding => ({ grounding, sources: [], promptSources: [] });

export async function resolveGrounding(
  requested: RequestedGrounding,
  topic: string,
  hasMaterial: boolean,
  search: KnowledgeSearch = searchKnowledge,
): Promise<ResolvedGrounding> {
  if (hasMaterial) return none("material");
  if (requested === "general") return none("general");

  let result: SearchResult;
  try {
    result = await search(topic, SEARCH_LIMIT);
  } catch (error) {
    // 检索出问题时课程照常生成，只是按通用知识讲
    console.error("[learn] 校园资料检索失败，改按通用知识生成：", error instanceof Error ? error.message : error);
    return none("general");
  }

  // 过滤正文只是「请打开原文」的资料；同一段只保留一次
  const seen = new Set<string>();
  const hits = result.hits.filter((hit) => {
    if (hit.chunk.content === ATTACHMENT_ONLY_NOTE || seen.has(hit.chunk.id)) return false;
    seen.add(hit.chunk.id);
    return true;
  });
  if (!hits.length) return none("general");
  // auto：检索结果够可信才算校园课程；campus：用户明确要求，有可用资料就用
  if (requested === "auto" && (result.lowConfidence || (result.topSimilarity ?? 0) < CAMPUS_MIN_SCORE)) return none("general");

  return {
    grounding: "campus",
    sources: hits.map((hit, index) => ({
      n: index + 1,
      title: hit.chunk.docTitle,
      heading: hit.chunk.heading || undefined,
      url: hit.chunk.sourceUrl ?? undefined,
      updated: hit.chunk.updated ?? undefined,
      snippet: hit.chunk.content.length > SNIPPET_CHARS ? `${hit.chunk.content.slice(0, SNIPPET_CHARS)}…` : hit.chunk.content,
    })),
    promptSources: hits.map((hit, index) => ({
      n: index + 1,
      title: hit.chunk.docTitle,
      heading: hit.chunk.heading || undefined,
      updated: hit.chunk.updated ?? undefined,
      content: hit.chunk.content,
    })),
  };
}
