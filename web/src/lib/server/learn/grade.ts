import type { LanguageModel } from "ai";
import { z } from "zod";
import type { QuizQuestion } from "@/lib/learn/schema";
import { estimateGrade } from "./demo";
import { GRADE_INSTRUCTIONS, gradePrompt } from "./prompts";
import { generateStructured } from "./structured";

// 简答题的 AI 批改。题目、参考答案和得分点都从服务端的课程里读，不信任客户端传来的任何题目内容。

export const gradeSchema = z.object({
  score: z.number().int().min(0).max(100).describe("0-100 的整数分：各得分点权重相同，答到一部分给部分分，答非所问给 0"),
  verdict: z.enum(["correct", "partial", "incorrect"]).describe("score ≥ 80 为 correct，40-79 为 partial，其余为 incorrect"),
  feedback: z.string().trim().min(1).max(160).describe("一两句具体反馈，先肯定对的地方，再指出缺什么，≤80 字"),
  hits: z.array(z.string().trim().min(1).max(80)).max(4).default([]).describe("命中的得分点，原样引用得分点文字"),
  missing: z.array(z.string().trim().min(1).max(80)).max(4).default([]).describe("遗漏的得分点，原样引用得分点文字"),
});

export type Verdict = "correct" | "partial" | "incorrect";
export type GradeResult = { score: number; verdict: Verdict; feedback: string; hits: string[]; missing: string[] };

// 结论按分数重新算，保证和分数一致（模型偶尔会写出和分数对不上的 verdict）
export const verdictOf = (score: number): Verdict => (score >= 80 ? "correct" : score >= 40 ? "partial" : "incorrect");

// 同一份答案不重复批改：内存缓存最多 500 条，满了丢最早的
const CACHE_SIZE = 500;
const cache = new Map<string, GradeResult>();

const normalize = (answer: string) => answer.trim().replace(/\s+/g, " ").toLowerCase();

export async function gradeAnswer(options: {
  lessonId: string;
  sceneId: string;
  index: number;
  question: QuizQuestion;
  answer: string;
  // null：演示模式，按关键词估分，不调用模型
  model: LanguageModel | null;
  signal: AbortSignal;
}): Promise<GradeResult> {
  const { question, answer } = options;
  if (!options.model) return estimateGrade(question.rubric, answer, question.reference);

  const key = `${options.lessonId}:${options.sceneId}:${options.index}:${normalize(answer)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const result = await generateStructured({
    model: options.model,
    name: "submitGrade",
    description: "提交简答题的批改结果",
    schema: gradeSchema,
    instructions: GRADE_INSTRUCTIONS,
    prompt: gradePrompt(question, answer),
    maxOutputTokens: 600,
    temperature: 0.2,
    timeoutMs: 20_000,
    signal: options.signal,
  });
  const graded: GradeResult = { score: result.score, verdict: verdictOf(result.score), feedback: result.feedback, hits: result.hits, missing: result.missing };
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  cache.set(key, graded);
  return graded;
}
