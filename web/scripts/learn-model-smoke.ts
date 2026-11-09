import { generateText, tool, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { outlineSchema, SCENE_TOOLS } from "../src/lib/learn/schema";
import { getChatModel } from "../src/lib/server/ai/models";
import { COMMON_RULES, outlinePrompt, scenePrompt, type LessonPromptInput } from "../src/lib/server/learn/prompts";
import { generateStructured, type ToolChoiceMode } from "../src/lib/server/learn/structured";

// 真实模型冒烟测试：会花一点点钱（一次约几分钱），只在改了 structured.ts 或提示词后跑。
// 运行（在 web/ 目录下）：node_modules\.bin\tsx.cmd --env-file=.env.local scripts\learn-model-smoke.ts [--scenes]
//   默认：1) 指定工具名的强制调用  2) 失败时改用 required  3) 用真实大纲提示词生成一份大纲
//   --scenes：再用这份大纲生成 1 个讲解页和 1 个测验页，检查逐页提示词与 schema
// 只打印结果和耗时，不打印 Key 和完整的模型输出。

const seconds = (started: number) => `${((performance.now() - started) / 1000).toFixed(1)}s`;

function describeError(error: unknown): string {
  const named = error as { name?: string; message?: string; statusCode?: number };
  const status = named.statusCode ? ` (HTTP ${named.statusCode})` : "";
  return `${named.name ?? "Error"}${status}：${(named.message ?? String(error)).replace(/\s+/g, " ").slice(0, 200)}`;
}

function usageText(usage?: LanguageModelUsage): string {
  if (!usage) return "";
  const cached = usage.inputTokenDetails?.cacheReadTokens;
  return ` · tokens 输入 ${usage.inputTokens ?? "?"}${cached ? `（缓存命中 ${cached}）` : ""} 输出 ${usage.outputTokens ?? "?"}`;
}

async function tryTiny(model: NonNullable<ReturnType<typeof getChatModel>>, mode: ToolChoiceMode): Promise<boolean> {
  const started = performance.now();
  try {
    const result = await generateText({
      model,
      instructions: "结果只能通过调用 submitList 提交。",
      prompt: "列出三种常见的校园社团，title 写“校园社团”。",
      tools: {
        submitList: tool({
          description: "提交一个标题和若干条目",
          inputSchema: z.object({ title: z.string(), items: z.array(z.string()).min(2) }),
        }),
      },
      toolChoice: mode === "required" ? "required" : { type: "tool", toolName: "submitList" },
      maxOutputTokens: 300,
      temperature: 0.3,
      timeout: { totalMs: 30_000 },
      maxRetries: 0,
    });
    const call = result.toolCalls.find((item) => item.toolName === "submitList");
    const ok = Boolean(call) && !call?.invalid;
    console.log(`${mode} 模式：${ok ? "成功" : "失败（没有有效的工具调用）"} · ${seconds(started)}${usageText(result.usage)}`);
    return ok;
  } catch (error) {
    console.log(`${mode} 模式：失败 · ${seconds(started)} · ${describeError(error)}`);
    return false;
  }
}

async function main() {
  const model = getChatModel();
  if (!model) {
    console.error("没有配置对话模型（LLM_BASE_URL / LLM_API_KEY / LLM_MODEL），无法冒烟测试");
    process.exitCode = 1;
    return;
  }
  const withScenes = process.argv.includes("--scenes");

  console.log("== 1/2 强制工具调用：指定工具名 vs required ==");
  const named = await tryTiny(model, "named");
  let mode: ToolChoiceMode = "named";
  if (!named) {
    const required = await tryTiny(model, "required");
    if (!required) {
      console.error("两种强制方式都不行：停下来告诉用户（备选是在提示词里写明 JSON 结构并自己解析）");
      process.exitCode = 1;
      return;
    }
    mode = "required";
  }
  console.log(`→ toolChoiceMode 默认值应为：${mode}`);

  console.log("\n== 3 用真实提示词生成大纲 ==");
  const request = { topic: "图书馆怎么借书、续借和还书", minutes: 10 as const, level: "入门" as const };
  const started = performance.now();
  let usage: LanguageModelUsage | undefined;
  const outline = await generateStructured({
    model,
    name: "submitOutline",
    description: "提交课程大纲",
    schema: outlineSchema,
    instructions: COMMON_RULES,
    prompt: outlinePrompt(request, "general", []),
    maxOutputTokens: 2000,
    signal: AbortSignal.timeout(90_000),
    toolChoiceMode: mode,
    onUsage: (value) => (usage = value),
  });
  console.log(`大纲通过校验 · ${seconds(started)}${usageText(usage)}`);
  console.log(`课程名：${outline.title} · 面向：${outline.audience} · ${outline.scenes.length} 页`);
  console.log(outline.scenes.map((scene, index) => `  ${index + 1}. [${scene.kind}] ${scene.title}`).join("\n"));

  if (!withScenes) return;

  console.log("\n== 逐页：1 个讲解页 + 1 个测验页 ==");
  const lesson: LessonPromptInput = { ...request, ...outline, grounding: "general" };
  const targets = [outline.scenes.findIndex((scene) => scene.kind === "slide"), outline.scenes.findIndex((scene) => scene.kind === "quiz")];
  for (const index of targets) {
    if (index < 0) continue;
    const scene = outline.scenes[index];
    const spec = SCENE_TOOLS[scene.kind];
    const sceneStarted = performance.now();
    let sceneUsage: LanguageModelUsage | undefined;
    const content = await generateStructured({
      model,
      name: spec.tool,
      description: `提交第 ${index + 1} 页的内容`,
      schema: spec.schema,
      instructions: COMMON_RULES,
      prompt: scenePrompt(lesson, index, []),
      maxOutputTokens: 2500,
      signal: AbortSignal.timeout(90_000),
      toolChoiceMode: mode,
      onUsage: (value) => (sceneUsage = value),
    });
    console.log(`第 ${index + 1} 页 [${scene.kind}] ${scene.title} 通过校验 · ${seconds(sceneStarted)}${usageText(sceneUsage)}`);
    console.log(`  ${JSON.stringify(content).slice(0, 220)}…`);
  }
}

main().catch((error) => {
  console.error("冒烟测试失败：", describeError(error));
  process.exitCode = 1;
});
