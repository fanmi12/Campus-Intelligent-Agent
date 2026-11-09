import type { LanguageModelUsage, LanguageModel } from "ai";
import { z } from "zod";
import { compileExpr, FIGURE_COLORS, figuresSchema, type Figure } from "@/lib/learn/figure";
import type { StoredSlideContent } from "@/lib/learn/schema";
import { COMMON_RULES, lessonContext, type LessonPromptInput, type PromptSource } from "./prompts";
import { generateStructured } from "./structured";

// 为学科课的讲解页配一张函数图像（可选、尽力而为）：
// 大纲里被标了 figure 的讲解页，生成完内容后再用一次调用画图。画不出来、画错了就丢掉，不影响这一页和整节课。
// 模型只交一个简化的「函数图」结构，下面转成完整的 plot 规格，再用和精选课程同一套校验把关。

const color = z.enum(FIGURE_COLORS);
const label = z.string().trim().min(1).max(14);

export const figureToolSchema = z.object({
  skip: z.boolean().optional().describe("这一页的内容用函数图像说不清楚时填 true，其余字段可以省略"),
  title: z.string().trim().min(1).max(30).optional().describe("图的标题，≤15 字"),
  caption: z.string().trim().min(1).max(120).optional().describe("一两句话说明这张图想让读者看出什么，≤60 字"),
  x: z.tuple([z.number(), z.number()]).optional().describe("横轴范围 [最小值, 最大值]，要把关键点都包进去并留一点余量"),
  y: z.tuple([z.number(), z.number()]).optional().describe("纵轴范围 [最小值, 最大值]"),
  xl: z.string().trim().min(1).max(10).optional().describe("横轴名称，如 x、t（秒）、Q（件）"),
  yl: z.string().trim().min(1).max(10).optional().describe("纵轴名称，如 y、s（米）、P（元）"),
  curves: z
    .array(z.object({ f: z.string().trim().min(1).max(60).describe("用 x 表示的表达式，只能用 + - * / ^ 括号、sin cos tan exp ln sqrt abs、常数 pi e，如 x^2、(100-x)/2、sin(x)"), color: color.optional() }))
    .max(4)
    .optional()
    .describe("函数曲线，最多 4 条"),
  lines: z.array(z.object({ a: z.number().describe("斜率"), b: z.number().optional().describe("截距，缺省为 0"), color: color.optional() })).max(4).optional().describe("直线 y = a·x + b，最多 4 条；竖线用 pts 加说明，不在这里画"),
  pts: z.array(z.object({ x: z.number(), y: z.number(), label: label.optional(), color: color.optional() })).max(5).optional().describe("关键点（交点、顶点、切点…），label 只写点的名字或坐标，如 P (1, 1)"),
});
export type FigureTool = z.infer<typeof figureToolSchema>;

const CYCLE = ["red", "blue", "green", "gold"] as const;

// 简化结构 → 完整的 plot 规格；任何一处不合格都返回 null
export function toFigure(tool: FigureTool): Figure | null {
  if (tool.skip || !tool.x || !tool.y || tool.x[0] >= tool.x[1] || tool.y[0] >= tool.y[1]) return null;
  if (!(tool.curves?.length || tool.lines?.length)) return null;
  const figure: Figure = {
    t: "plot",
    x: tool.x,
    y: tool.y,
    ...(tool.title ? { title: tool.title } : {}),
    ...(tool.caption ? { caption: tool.caption } : {}),
    ...(tool.xl ? { xl: tool.xl } : {}),
    ...(tool.yl ? { yl: tool.yl } : {}),
    curves: (tool.curves ?? []).map((curve, index) => ({ f: curve.f, color: curve.color ?? CYCLE[index % CYCLE.length] })),
    lines: (tool.lines ?? []).map((line, index) => ({ a: line.a, b: line.b ?? 0, color: line.color ?? CYCLE[(index + (tool.curves?.length ?? 0)) % CYCLE.length] })),
    pts: (tool.pts ?? []).map((point) => ({ x: point.x, y: point.y, ...(point.label ? { label: point.label } : {}), color: point.color ?? "ink" })),
  };
  // 和精选课程同一套校验：表达式能不能算、颜色、范围…
  if (!figuresSchema.safeParse([figure]).success) return null;
  // 曲线在范围内要真的画得出来：至少一半的采样点有有限的值，并且有一部分落在纵轴范围里，免得出一张空图
  for (const curve of figure.curves ?? []) {
    const f = compileExpr(curve.f);
    let finite = 0;
    let inside = 0;
    for (let k = 0; k <= 40; k++) {
      const x = figure.x[0] + ((figure.x[1] - figure.x[0]) * k) / 40;
      const y = f.evaluate({ x });
      if (Number.isFinite(y)) finite++;
      if (Number.isFinite(y) && y >= figure.y[0] && y <= figure.y[1]) inside++;
    }
    if (finite < 20 || inside < 4) return null;
  }
  return figure;
}

export function figurePrompt(lesson: LessonPromptInput, index: number, slide: StoredSlideContent, sources: PromptSource[], material?: string): string {
  const scene = lesson.scenes[index];
  const points = slide.points.map((point, i) => `${i + 1}. ${point.heading}：${point.body}`).join("\n");
  return `${lessonContext(lesson, sources, material)}

## 你的任务：为第 ${index + 1}/${lesson.scenes.length} 页「${scene.title}」（讲解页）配一张函数图像，然后调用 submitFigure
这一页已经写好：
导语：${slide.lead}
${points}
- 只画这一页讲的内容，图要和上面的文字、数字完全一致（曲线经过的点、交点、顶点、斜率都要对得上）。
- 曲线用 curves，f 是用 x 表示的表达式；直线用 lines；关键点用 pts，label 只写点的名字或坐标，不写长句子。
- x、y 范围要把关键点都包进去并留一点余量；曲线在范围里要看得见。横纵轴名称写在 xl、yl。
- 不确定画得对、或者这页的内容用函数图像说不清楚，就把 skip 设为 true，宁可不配图。`;
}

export type FigureGeneration = {
  model: LanguageModel;
  lesson: LessonPromptInput;
  index: number;
  slide: StoredSlideContent;
  sources: PromptSource[];
  material?: string;
  signal: AbortSignal;
  onUsage?: (usage: LanguageModelUsage) => void;
};

// 生成一张图；任何失败（模型报错、结构不对、画不出来）都返回 null，调用方直接不配图
export async function generateFigure({ model, lesson, index, slide, sources, material, signal, onUsage }: FigureGeneration): Promise<Figure | null> {
  try {
    const tool = await generateStructured({
      model,
      name: "submitFigure",
      description: "提交这一页的函数图像",
      schema: figureToolSchema,
      instructions: COMMON_RULES,
      prompt: figurePrompt(lesson, index, slide, sources, material),
      maxOutputTokens: 900,
      temperature: 0.2,
      timeoutMs: 40_000,
      signal,
      onUsage,
    });
    return toFigure(tool);
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}
