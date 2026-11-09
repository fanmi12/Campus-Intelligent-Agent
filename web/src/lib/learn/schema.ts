import { z } from "zod";

// 小狮课堂的数据结构，前后端共用（不能 import node: 模块或 lib/server/ 下的文件）。
// 生成时这些 schema 直接作为强制工具调用的 inputSchema，describe 里的文字就是写给模型看的格式要求。
// 课程形式参考 OpenMAIC（MIT）的两阶段生成：先出大纲，再逐页生成内容。
//
// 约定：每种页面一个扁平 schema（不用 discriminatedUnion / anyOf），DeepSeek 对扁平对象的函数参数最稳；
// 长度上限比提示词里要求的宽一倍，避免模型稍长一点就校验失败；逻辑约束放在 superRefine，
// 校验失败会带着错误信息让模型重试一次（见 lib/server/learn/structured.ts）。

export const LESSON_VERSION = 1 as const;
export const LESSON_ID = /^[A-Za-z0-9_-]{6,24}$/;
// 一节课存成 JSON 后的字节上限，防止异常内容撑大数据库
export const MAX_LESSON_JSON = 400_000;

const text = (max: number) => z.string().trim().min(1).max(max);
const sourceNumbers = z.array(z.number().int().min(1).max(12)).max(8).default([]);

export const SCENE_KINDS = ["slide", "quiz", "flashcards", "discussion", "summary"] as const;
export const sceneKindSchema = z.enum(SCENE_KINDS);
export type SceneKind = z.infer<typeof sceneKindSchema>;

export const LEVELS = ["入门", "进阶", "复习"] as const;
export const levelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof levelSchema>;

export const MINUTES = [5, 10, 15] as const;
export type Minutes = (typeof MINUTES)[number];

export const requestedGroundingSchema = z.enum(["auto", "campus", "general"]);
export type RequestedGrounding = z.infer<typeof requestedGroundingSchema>;
// 课程依据：campus 校园资料；general 通用知识；material 学习者提供的资料
export type Grounding = "campus" | "general" | "material";

export const AGENT_IDS = ["teacher", "xiaolin", "xiaomei"] as const;
export const agentIdSchema = z.enum(AGENT_IDS);
export type AgentId = z.infer<typeof agentIdSchema>;

// ---------- 第一阶段：大纲 ----------
export const outlineSceneSchema = z.object({
  kind: sceneKindSchema.describe("页面类型：slide 讲解、quiz 测验、flashcards 闪卡、discussion 讨论、summary 总结"),
  title: text(24).describe("页面标题，≤16 字，中性简短，不出现老师名字"),
  goal: text(80).describe("这一页的学习目标，一句话"),
  keyPoints: z.array(text(60)).min(1).max(5).describe("这一页要讲或要考的 1-5 个具体要点"),
});

export const outlineSchema = z
  .object({
    unsuitable: z.string().trim().max(80).optional().describe("仅当主题不适合生成学习课程时填写原因；正常情况省略"),
    title: text(30).describe("课程名：≤20 字的名词短语，不用问句，不带“课程”二字"),
    summary: text(160).describe("一两句话说明这节课讲什么"),
    audience: text(40).describe("面向的学习者，例如“大一新生”“准备四级的同学”"),
    objectives: z.array(text(60)).max(4).describe("学完能做到的 2-4 件事"),
    scenes: z.array(outlineSceneSchema).max(10).describe("按上课顺序排列的页面"),
  })
  .superRefine((outline, ctx) => {
    if (outline.unsuitable) return;
    const kinds = outline.scenes.map((scene) => scene.kind);
    const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["scenes"], message });
    if (outline.objectives.length < 2) ctx.addIssue({ code: "custom", path: ["objectives"], message: "至少写 2 条学习目标" });
    if (kinds.length < 4) issue("至少需要 4 页");
    if (kinds[0] !== "slide") issue("第一页必须是讲解页 slide");
    if (kinds.at(-1) !== "summary") issue("最后一页必须是总结页 summary");
    if (!kinds.includes("quiz")) issue("至少要有一个测验页 quiz");
    if (kinds.filter((kind) => kind === "summary").length > 1) issue("总结页只能有一页");
    if (kinds.filter((kind) => kind === "discussion").length > 1) issue("讨论页最多一页");
  });
export type Outline = z.infer<typeof outlineSchema>;

// ---------- 第二阶段：各类页面 ----------
export const slideContentSchema = z
  .object({
    lead: text(100).describe("一句话导语"),
    layout: z
      .enum(["points", "steps", "compare"])
      .describe("points 并列要点；steps 有先后顺序的步骤；compare 对比（配合 table）"),
    points: z
      .array(
        z.object({
          heading: text(24).describe("要点小标题，≤12 字"),
          body: text(140).describe("一句话说明，≤60 字"),
          sourceNumbers: sourceNumbers.describe("依据的参考资料编号；没用到资料填 []"),
        }),
      )
      .min(2)
      .max(5),
    example: z.object({ title: text(24), body: text(260) }).optional().describe("可选：贴近大学生活的例子或易错提醒"),
    table: z
      .object({
        columns: z.array(text(16)).min(2).max(4),
        rows: z.array(z.array(text(40)).min(2).max(4)).min(1).max(6),
      })
      .optional()
      .describe("可选：对比或列举时使用；每行单元格数必须等于列数"),
    narration: z
      .array(
        z.object({
          point: z.number().int().min(-1).max(4).describe("对应 points 的下标（从 0 开始）；开场、过渡填 -1"),
          text: text(200).describe("老师说的话：一到两句口语，30-80 字"),
        }),
      )
      .min(2)
      .max(8),
  })
  .superRefine((slide, ctx) => {
    slide.narration.forEach((segment, index) => {
      if (segment.point >= slide.points.length) {
        ctx.addIssue({ code: "custom", path: ["narration", index, "point"], message: `point 不能大于 ${slide.points.length - 1}` });
      }
    });
    const columns = slide.table?.columns.length;
    slide.table?.rows.forEach((row, index) => {
      if (row.length !== columns) ctx.addIssue({ code: "custom", path: ["table", "rows", index], message: "每行单元格数必须等于列数" });
    });
  });
export type SlideContent = z.infer<typeof slideContentSchema>;

export const quizQuestionSchema = z
  .object({
    type: z.enum(["single", "multiple", "short"]).describe("single 单选；multiple 多选；short 简答"),
    prompt: text(140).describe("题干"),
    options: z.array(text(60)).max(5).default([]).describe("单选 3-4 个、多选 4-5 个选项；简答填 []"),
    answers: z
      .array(z.number().int().min(0).max(4))
      .max(4)
      .default([])
      .describe("正确选项下标（从 0 开始）：单选 1 个，多选 2-4 个；简答填 []"),
    reference: z.string().trim().max(300).default("").describe("简答题参考答案（50-150 字）；选择题填空字符串"),
    rubric: z.array(text(60)).max(4).default([]).describe("简答题得分点 1-4 条；选择题填 []"),
    explanation: text(200).describe("解析：为什么对、错在哪"),
    point: text(24).describe("考查的知识点名称，≤12 字"),
  })
  .superRefine((question, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const unique = (values: unknown[]) => new Set(values).size === values.length;
    if (question.type === "short") {
      if (!question.reference) add("reference", "简答题必须有参考答案");
      if (!question.rubric.length) add("rubric", "简答题至少 1 个得分点");
      return;
    }
    const [min, max] = question.type === "single" ? [3, 4] : [4, 5];
    if (question.options.length < min || question.options.length > max) add("options", `需要 ${min}-${max} 个选项`);
    if (!unique(question.options)) add("options", "选项不能重复");
    if (!unique(question.answers) || question.answers.some((answer) => answer >= question.options.length)) {
      add("answers", "答案下标无效或重复");
    }
    if (question.type === "single" && question.answers.length !== 1) add("answers", "单选题只能有 1 个答案");
    if (question.type === "multiple" && (question.answers.length < 2 || question.answers.length > 4)) {
      add("answers", "多选题需要 2-4 个答案");
    }
  });

export const quizContentSchema = z
  .object({ questions: z.array(quizQuestionSchema).min(2).max(4) })
  .superRefine((quiz, ctx) => {
    if (quiz.questions.filter((question) => question.type === "short").length > 1) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: "简答题最多 1 道" });
    }
    if (!quiz.questions.some((question) => question.type === "single")) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: "至少 1 道单选题" });
    }
  });
export type QuizContent = z.infer<typeof quizContentSchema>;
export type QuizQuestion = QuizContent["questions"][number];

export const flashcardsContentSchema = z.object({
  cards: z
    .array(
      z.object({
        front: text(40).describe("要记住的术语、规定或问题，≤20 字"),
        back: text(160).describe("简明解释或答案，≤80 字"),
        hint: z.string().trim().max(60).optional().describe("可选：记忆提示"),
      }),
    )
    .min(3)
    .max(8),
});
export type FlashcardsContent = z.infer<typeof flashcardsContentSchema>;

export const discussionContentSchema = z.object({
  question: text(100).describe("抛给学习者的开放问题，≤50 字，不是是非题"),
  context: text(200).describe("讨论背景，一两句"),
  opening: z
    .array(z.object({ agent: agentIdSchema, text: text(120) }))
    .min(2)
    .max(4)
    .describe("开场：先由 xiaolin 或 xiaomei 说观点或疑问，最后一句由 teacher 邀请学习者发言"),
});
export type DiscussionContent = z.infer<typeof discussionContentSchema>;

export const summaryContentSchema = z.object({
  recap: z.array(text(60)).min(3).max(6).describe("整节课最重要的结论"),
  map: z
    .array(z.object({ label: text(20), children: z.array(text(30)).max(5).default([]) }))
    .min(2)
    .max(6)
    .describe("知识结构图：一级节点（通常对应讲解页）及其子节点（关键词）"),
  nextSteps: z.array(text(60)).min(1).max(3).describe("下一步建议"),
  narration: z
    .array(z.object({ point: z.number().int().min(-1).max(5), text: text(200) }))
    .min(1)
    .max(4)
    .describe("收尾讲解；point 对应 recap 下标，-1 为总述"),
});
export type SummaryContent = z.infer<typeof summaryContentSchema>;

// 每种页面对应的提交工具
export const SCENE_TOOLS = {
  slide: { tool: "submitSlide", schema: slideContentSchema },
  quiz: { tool: "submitQuiz", schema: quizContentSchema },
  flashcards: { tool: "submitFlashcards", schema: flashcardsContentSchema },
  discussion: { tool: "submitDiscussion", schema: discussionContentSchema },
  summary: { tool: "submitSummary", schema: summaryContentSchema },
} as const;

// ---------- 存储与接口里的课程 ----------
export type SceneStatus = "pending" | "generating" | "ready" | "failed";
type SceneBase = { id: string; title: string; goal: string; keyPoints: string[]; status: SceneStatus; error?: string };
export type LessonScene =
  | (SceneBase & { kind: "slide"; content?: SlideContent })
  | (SceneBase & { kind: "quiz"; content?: QuizContent })
  | (SceneBase & { kind: "flashcards"; content?: FlashcardsContent })
  | (SceneBase & { kind: "discussion"; content?: DiscussionContent })
  | (SceneBase & { kind: "summary"; content?: SummaryContent });

export type LessonSource = {
  n: number;
  title: string;
  heading?: string;
  url?: string;
  updated?: string;
  snippet: string;
};
export type LessonStatus = "generating" | "ready" | "failed";
export type LessonStep = "queued" | "researching" | "outlining" | "writing" | "done";

export type Lesson = {
  id: string;
  version: typeof LESSON_VERSION;
  status: LessonStatus;
  step: LessonStep;
  error?: string;
  topic: string;
  level: Level;
  minutes: Minutes;
  grounding: Grounding;
  title: string; // 大纲出来前用 topic 截断到 30 字
  summary: string;
  audience: string;
  objectives: string[];
  scenes: LessonScene[];
  sources: LessonSource[];
  createdAt: number;
  updatedAt: number;
  generatedMs?: number;
  featured?: boolean;
  demo?: boolean;
};

export type LessonSummary = Pick<
  Lesson,
  "id" | "title" | "topic" | "status" | "step" | "minutes" | "grounding" | "createdAt"
> & { done: number; total: number };

// ---------- 接口请求 ----------
export const createLessonRequestSchema = z.object({
  topic: z.string().trim().min(2, "请写下想学的主题").max(200, "主题最多 200 字"),
  level: levelSchema.default("入门"),
  minutes: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
  grounding: requestedGroundingSchema.default("auto"),
  material: z.string().trim().max(12000, "资料最多 12000 字").optional(),
  images: z
    .array(
      z.object({
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        url: z.string().startsWith("data:image/").max(2_000_000),
      }),
    )
    .max(3)
    .optional(),
});
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;
