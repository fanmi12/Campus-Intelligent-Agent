import { RetryError, type LanguageModel, type LanguageModelUsage } from "ai";
import {
  outlineSchema,
  SCENE_TOOLS,
  type Lesson,
  type SceneKind,
  type SlideContent,
  type SummaryContent,
} from "@/lib/learn/schema";
import { getLearnModel } from "../ai/models";
import { readImages, type ImageInput } from "../ai/vision";
import { ChatQueueError, type QueueOwner } from "../chat-queue";
import { learnJobs, learnQueuePositions } from "./jobs";
import {
  COMMON_RULES,
  DISCUSSION_ENABLED,
  MATERIAL_OCR_INSTRUCTION,
  outlinePrompt,
  scenePrompt,
  type PromptSource,
} from "./prompts";
import { lessonQueue } from "./quota";
import { resolveGrounding, type KnowledgeSearch } from "./sources";
import { getLesson, getMaterial, saveLesson, setMaterial } from "./store";
import { generateStructured } from "./structured";

// 两阶段生成管线：查资料 → 大纲 → 逐页内容（并发 3，第 1 页最先完成）。
// 生成在服务端后台进行，关掉页面不会中断；进度和结果随时写进课程记录，前端轮询读取。
// 参考 OpenMAIC 的做法：先出大纲，再逐页生成；一页失败不影响其他页，可以单独重新生成。

const TOTAL_TIMEOUT_MS = 6 * 60_000;
const PAGE_CONCURRENCY = 3;
const MAX_MATERIAL_CHARS = 12000;
const PAGE_FAILED = "这一页没生成成功";
const SCENE_TOKENS: Record<SceneKind, number> = { slide: 2500, quiz: 2500, flashcards: 1500, discussion: 1200, summary: 2000 };
const SPEAKER_PREFIX = /^(狮老师|老师)[:：]\s*/;

// 识图结果里没有可用的文字：太短，或者模型说「无文字」（风景照、空白页）
export function hasReadableText(text: string): boolean {
  const plain = text.replace(/[\s\p{P}\p{S}]/gu, "");
  return plain.length >= 8 && !/^(图片|图中|图像)?(中)?(没有|无|未见|不含)(任何|可读|可识别)?(的)?文字/.test(plain);
}

// 给同学看的失败原因：不把上游原始报错透给前端
export class LessonError extends Error {}

// 只供测试注入：用假模型、假检索跑完整条管线，不花钱
export type GenerationDeps = {
  model?: LanguageModel | null;
  search?: KnowledgeSearch;
  readImages?: typeof readImages;
};

export type GenerationOptions = {
  owner: QueueOwner;
  images?: ImageInput[];
  // 重新生成：已有大纲只补做没完成的页；没有大纲从头来
  resume?: boolean;
  deps?: GenerationDeps;
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function unwrap(error: unknown): unknown {
  return RetryError.isInstance(error) ? error.lastError : error;
}

export function friendlyError(error: unknown, signal?: AbortSignal): string {
  const root = unwrap(error);
  if (root instanceof LessonError || root instanceof ChatQueueError) return root.message;
  const named = root as { name?: string; message?: string; statusCode?: number; responseBody?: string };
  const text = `${named.message ?? ""} ${named.responseBody ?? ""}`;
  if (/Content Exists Risk/i.test(text)) return "这个主题可能涉及敏感内容，换个说法或主题试试";
  if (named.statusCode === 401 || named.statusCode === 402 || named.statusCode === 403) {
    console.error(`[learn] 模型服务返回 ${named.statusCode}，请检查密钥或余额`);
    return "模型服务暂时不可用，请联系管理员";
  }
  if (signal?.aborted || /^(AbortError|TimeoutError)$/.test(named.name ?? "") || /timed? ?out|aborted/i.test(text)) {
    return "备课超时了，请点「重新生成」";
  }
  return "备课失败了，请稍后再试";
}

// 日志里只留错误类型和前 200 字，不打印 Key、资料原文和用户输入全文
function brief(error: unknown): string {
  const root = unwrap(error) as { name?: string; message?: string };
  return `${root?.name ?? "Error"}: ${(root?.message ?? String(root)).replace(/\s+/g, " ").slice(0, 200)}`;
}

async function mapLimit(count: number, limit: number, worker: (index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < count) await worker(next++);
  };
  await Promise.all(Array.from({ length: Math.min(limit, count) }, run));
}

const CITATION = /\[(\d{1,2})\]/g;

// 把内容里所有字符串逐个处理一遍
function mapStrings(value: unknown, fn: (text: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, fn)]));
  return value;
}

// 生成后的清洗（直接修正，不报错）：
// - 出处编号只保留资料里真有的。非校园课程没有参考资料，不动正文，免得误伤 a[1] 这类写法；
// - 讲解词是读出来的：去掉开头偶尔带的「狮老师：」，校园课程里也不留编号
function cleanContent(kind: SceneKind, content: unknown, lesson: Lesson): unknown {
  const campus = lesson.grounding === "campus";
  const valid = new Set(campus ? lesson.sources.map((source) => source.n) : []);
  const cleaned = campus ? mapStrings(content, (text) => text.replace(CITATION, (marker, n: string) => (valid.has(Number(n)) ? marker : ""))) : content;
  const spoken = (text: string) => {
    const plain = text.replace(SPEAKER_PREFIX, "");
    return campus ? plain.replace(CITATION, "").replace(/\s{2,}/g, " ").trim() : plain;
  };
  if (kind === "slide") {
    const slide = cleaned as SlideContent;
    return {
      ...slide,
      points: slide.points.map((point) => ({ ...point, sourceNumbers: [...new Set(point.sourceNumbers.filter((n) => valid.has(n)))] })),
      narration: slide.narration.map((segment) => ({ ...segment, text: spoken(segment.text) })),
    };
  }
  if (kind === "summary") {
    const summary = cleaned as SummaryContent;
    return { ...summary, narration: summary.narration.map((segment) => ({ ...segment, text: spoken(segment.text) })) };
  }
  return cleaned;
}

export async function runLessonGeneration(id: string, options: GenerationOptions): Promise<void> {
  // 同一节课同时只跑一个任务；先登记，排队期间也算「在备课」（备课中断检测靠它）
  if (learnJobs.has(id)) return;
  const controller = new AbortController();
  learnJobs.set(id, controller);
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(TOTAL_TIMEOUT_MS)]);
  const started = Date.now();
  let release: (() => void) | undefined;
  const usage = { input: 0, cached: 0, output: 0 };
  const onUsage = (value: LanguageModelUsage) => {
    usage.input += value.inputTokens ?? 0;
    usage.cached += value.inputTokenDetails?.cacheReadTokens ?? 0;
    usage.output += value.outputTokens ?? 0;
  };

  try {
    const lesson = getLesson(id);
    if (!lesson) return;
    const model = options.deps?.model !== undefined ? options.deps.model : getLearnModel();
    if (!model) throw new LessonError("模型服务暂时不可用，请联系管理员");

    // 1. 排队：同时生成的课程数有限，多出来的等待，位置写到 jobs.ts 里供 GET 接口返回
    release = await lessonQueue.acquire(
      signal,
      (state) => {
        if (state.status === "waiting") learnQueuePositions.set(id, state.position);
        else learnQueuePositions.delete(id);
      },
      options.owner,
    );
    learnQueuePositions.delete(id);

    lesson.status = "generating";
    delete lesson.error;
    const resuming = Boolean(options.resume) && lesson.scenes.length > 0;
    let material = getMaterial(id) ?? undefined;
    let promptSources: PromptSource[];
    let researchMs = 0;
    let outlineMs = 0;

    if (resuming) {
      // 已有大纲：只补做没完成的页。资料出处只剩前端用的片段，提示词里就用片段
      promptSources = lesson.sources.map((source) => ({
        n: source.n,
        title: source.title,
        heading: source.heading,
        updated: source.updated,
        content: source.snippet,
      }));
      lesson.step = "writing";
      lesson.scenes = lesson.scenes.map((scene) => (scene.status === "ready" ? scene : { ...scene, status: "pending" as const, error: undefined }));
      saveLesson(lesson);
    } else {
      // 2. 查资料：学习者的资料（含拍照转写）> 校园资料 > 通用知识
      lesson.step = "researching";
      saveLesson(lesson);
      const researchStarted = Date.now();
      if (options.images?.length) {
        const read = options.deps?.readImages ?? readImages;
        let recognized: string;
        try {
          recognized = await read(options.images, signal, { instruction: MATERIAL_OCR_INSTRUCTION, maxOutputTokens: 3000 });
        } catch (error) {
          if (signal.aborted) throw error;
          console.error(`[learn] ${id} 图片识别失败：${brief(error)}`);
          throw new LessonError("暂时没能识别图片，请改为直接粘贴文字");
        }
        if (!hasReadableText(recognized)) throw new LessonError("没能从图片里读出文字，换一张清晰的照片试试");
        // 转写结果存起来，重新生成时不用再识图
        material = [material, recognized.trim()].filter(Boolean).join("\n\n").slice(0, MAX_MATERIAL_CHARS);
        setMaterial(id, material);
      }
      const resolved = await resolveGrounding(lesson.requestedGrounding ?? "auto", lesson.topic, Boolean(material), options.deps?.search);
      lesson.grounding = resolved.grounding;
      lesson.sources = resolved.sources;
      promptSources = resolved.promptSources;
      researchMs = Date.now() - researchStarted;

      // 3. 大纲
      lesson.step = "outlining";
      saveLesson(lesson);
      const outlineStarted = Date.now();
      const outline = await generateStructured({
        model,
        name: "submitOutline",
        description: "提交课程大纲",
        schema: outlineSchema,
        instructions: COMMON_RULES,
        prompt: outlinePrompt({ topic: lesson.topic, minutes: lesson.minutes, level: lesson.level }, lesson.grounding, promptSources, material),
        maxOutputTokens: 2000,
        signal,
        onUsage,
      });
      outlineMs = Date.now() - outlineStarted;
      if (outline.unsuitable) throw new LessonError(`这个主题不太适合生成课程：${outline.unsuitable}`);
      lesson.title = outline.title;
      lesson.summary = outline.summary;
      lesson.audience = outline.audience;
      lesson.objectives = outline.objectives;
      // 讨论页在多智能体功能开放前不生成（Phase 2 打开 DISCUSSION_ENABLED）
      lesson.scenes = outline.scenes
        .filter((scene) => DISCUSSION_ENABLED || scene.kind !== "discussion")
        .map((scene, index) => ({ ...scene, id: `s${index + 1}`, status: "pending" as const }));
      lesson.step = "writing";
      saveLesson(lesson);
    }

    // 4. 逐页：按顺序、并发 3，一页失败不影响其他页
    const todo = lesson.scenes.flatMap((scene, index) => (scene.status === "pending" ? [index] : []));
    let lastError: unknown;
    const writeStarted = Date.now();
    await mapLimit(todo.length, PAGE_CONCURRENCY, async (position) => {
      const index = todo[position];
      const scene = lesson.scenes[index];
      if (signal.aborted) return;
      scene.status = "generating";
      saveLesson(lesson);
      try {
        const spec = SCENE_TOOLS[scene.kind];
        const content = await generateStructured({
          model,
          name: spec.tool,
          description: `提交第 ${index + 1} 页「${scene.title}」的内容`,
          schema: spec.schema,
          instructions: COMMON_RULES,
          prompt: scenePrompt(lesson, index, promptSources, material),
          maxOutputTokens: SCENE_TOKENS[scene.kind],
          signal,
          onUsage,
        });
        (scene as { content?: unknown }).content = cleanContent(scene.kind, content, lesson);
        scene.status = "ready";
        delete scene.error;
      } catch (error) {
        lastError = error;
        scene.status = "failed";
        scene.error = PAGE_FAILED;
        console.error(`[learn] ${id} 第 ${index + 1} 页失败：${brief(error)}`);
      }
      saveLesson(lesson);
    });

    // 5. 收尾：没来得及生成的页标为失败（可重新生成）；至少 1 页成功就算备课完成
    const ready = lesson.scenes.filter((scene) => scene.status === "ready").length;
    for (const scene of lesson.scenes) {
      if (scene.status === "ready") continue;
      scene.status = "failed";
      scene.error ??= PAGE_FAILED;
    }
    lesson.step = "done";
    lesson.generatedMs = Date.now() - started;
    if (ready > 0) {
      lesson.status = "ready";
    } else {
      lesson.status = "failed";
      lesson.error = lastError ? friendlyError(lastError, signal) : "备课失败了，请稍后再试";
    }
    saveLesson(lesson);
    console.log(
      `[learn] ${id} 资料 ${seconds(researchMs)} · 大纲 ${seconds(outlineMs)} · 页面 ${ready}/${lesson.scenes.length}（${seconds(Date.now() - writeStarted)}） · 全程 ${seconds(Date.now() - started)} · 依据 ${lesson.grounding}(${lesson.sources.length}) · tokens 入 ${usage.input}（缓存 ${usage.cached}）出 ${usage.output}`,
    );
  } catch (error) {
    console.error(`[learn] ${id} 备课失败：${brief(error)}`);
    failLesson(id, friendlyError(error, signal));
  } finally {
    release?.();
    learnJobs.delete(id);
    learnQueuePositions.delete(id);
  }
}

// 整节课失败：已有的页面保留（重新生成时只补没完成的页）
function failLesson(id: string, message: string) {
  try {
    const lesson = getLesson(id);
    if (!lesson) return;
    lesson.status = "failed";
    lesson.error = message;
    lesson.step = "done";
    for (const scene of lesson.scenes) {
      if (scene.status !== "ready") scene.status = "failed";
    }
    saveLesson(lesson);
  } catch (error) {
    console.error(`[learn] ${id} 保存失败状态时出错：${brief(error)}`);
  }
}
