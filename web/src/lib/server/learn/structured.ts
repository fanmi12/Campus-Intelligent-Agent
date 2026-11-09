import { generateText, tool, ToolChoiceViolationError, type LanguageModel, type LanguageModelUsage } from "ai";
import type { z } from "zod";

// 用"只有一个工具、必须调用它"的方式让模型按 schema 交结果。
// 本项目的卡片工具已验证 DeepSeek 对这种方式很稳；Output.object 在这里不适用：
// openai-compatible 提供方默认只发 response_format: json_object，不会把 schema 发给模型（supportsStructuredOutputs 默认 false）。
//
// AI SDK 7（ai@7.0.127，读源码确认）对强制工具调用的处理：
// - 模型根本没调用指定的工具 → generateText 抛 ToolChoiceViolationError；
// - 调用了，但参数不符合 schema → 不抛错，result.toolCalls 里那一项带 invalid: true 和 error。
// 所以两种情况都要处理：把校验错误整理成一句话，附在提示词末尾让模型重试一次。

// named：指定工具名（toolChoice: { type: "tool" }）；required：必须调用某个工具（这里只有一个工具，效果相同）。
// 2026-11-09 用 scripts/learn-model-smoke.ts 实测：DeepSeek（关闭思考）支持 named，大纲约 10 秒、单页 4-6 秒，
// 格式一次通过校验，所以默认 named；换了模型服务商后不支持时，改成 required 即可
export type ToolChoiceMode = "named" | "required";
export const DEFAULT_TOOL_CHOICE_MODE: ToolChoiceMode = "named";

// 单次调用的总时限；整节课另有总时限（见 generate.ts）
const DEFAULT_TIMEOUT_MS = 60_000;
const MISSING_CALL = "模型没有提交结构化结果";

// 把各种校验错误整理成「字段路径：问题」的短句，最多 3 条
function collectIssues(error: unknown, depth = 0): string[] {
  if (!error || typeof error !== "object" || depth > 4) return [];
  const issues = (error as { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    return issues.slice(0, 3).map((issue: { path?: unknown[]; message?: string }) => {
      const path = (issue.path ?? []).map(String).join(".");
      return `${path || "整体"}：${issue.message ?? "格式不对"}`;
    });
  }
  return collectIssues((error as { cause?: unknown }).cause, depth + 1);
}

export function describeProblem(error: unknown): string {
  const issues = collectIssues(error);
  const text = issues.length ? issues.join("；") : error instanceof Error ? error.message : String(error);
  return text.slice(0, 300);
}

export async function generateStructured<S extends z.ZodType>(options: {
  model: LanguageModel;
  name: string; // 工具名，如 submitOutline
  description: string; // 一句话说明这个工具交什么
  schema: S;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
  temperature?: number;
  signal: AbortSignal;
  timeoutMs?: number;
  toolChoiceMode?: ToolChoiceMode;
  onUsage?: (usage: LanguageModelUsage) => void;
}): Promise<z.output<S>> {
  const mode = options.toolChoiceMode ?? DEFAULT_TOOL_CHOICE_MODE;
  let feedback = "";
  for (let attempt = 0; ; attempt++) {
    let problem: string;
    try {
      const result = await generateText({
        model: options.model,
        instructions: options.instructions,
        prompt: feedback
          ? `${options.prompt}\n\n【上一次提交没有通过校验】${feedback}\n请修正后重新调用 ${options.name}。`
          : options.prompt,
        tools: { [options.name]: tool({ description: options.description, inputSchema: options.schema as z.ZodType }) },
        toolChoice: mode === "required" ? "required" : { type: "tool", toolName: options.name },
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature ?? 0.5,
        abortSignal: options.signal,
        timeout: { totalMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
        maxRetries: 1,
      });
      options.onUsage?.(result.usage);
      const call = result.toolCalls.find((item) => item.toolName === options.name);
      if (!call) throw new Error(MISSING_CALL);
      if (call.invalid) {
        problem = describeProblem((call as { error?: unknown }).error);
      } else {
        // 工具层已经校验过一次；再用完整 schema 解析一次，拿到带默认值的结果，并兜住 superRefine
        const parsed = options.schema.safeParse(call.input);
        if (parsed.success) return parsed.data;
        problem = describeProblem(parsed.error);
      }
    } catch (error) {
      const retryable = ToolChoiceViolationError.isInstance(error) || (error instanceof Error && error.message === MISSING_CALL);
      if (options.signal.aborted || !retryable || attempt > 0) throw error;
      problem = "没有调用指定的工具";
    }
    if (attempt > 0) throw new Error(`模型两次提交都没有通过校验：${problem}`);
    feedback = problem;
  }
}
