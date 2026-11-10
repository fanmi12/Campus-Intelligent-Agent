import { z } from "zod";
import { LESSON_ID } from "@/lib/learn/schema";
import { getLearnModel } from "@/lib/server/ai/models";
import { isDemoMode } from "@/lib/server/env";
import { clientIdOf, disabled, fail, firstMessage, reply } from "@/lib/server/learn/api";
import { gradeAnswer } from "@/lib/server/learn/grade";
import { getLesson, recordLessonEvent } from "@/lib/server/learn/store";
import { rateLimit } from "@/lib/server/rate-limit";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  sceneId: z.string().regex(/^[\w-]{1,16}$/, "请求格式不正确"),
  question: z.number().int().min(0).max(9),
  answer: z.string().trim().min(1, "请先写下答案").max(600, "答案最多 600 字"),
});

// 简答题 AI 批改。题目、参考答案、得分点都从服务端的课程里取，客户端只传「第几页第几题」和作答
export async function POST(req: Request, { params }: Params) {
  const off = disabled();
  if (off) return off;
  const { id } = await params;
  const lesson = LESSON_ID.test(id) ? getLesson(id) : null;
  if (!lesson) return fail("课程不存在或已删除", 404);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return fail("请求格式不正确", 400);
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return fail(firstMessage(parsed.error.issues), 400);
  const client = clientIdOf(req);
  if (!client) return fail("请刷新页面后再试", 400);
  if (!rateLimit(`learn-grade:${client}`, 20)) return fail("批改有点频繁，请稍后再试", 429);

  const { sceneId, question: index, answer } = parsed.data;
  const scene = lesson.scenes.find((item) => item.id === sceneId);
  const question = scene?.kind === "quiz" ? scene.content?.questions[index] : undefined;
  if (!scene || !question || question.type !== "short") return fail("题目不存在，或者不是简答题", 404);

  try {
    const result = await gradeAnswer({
      lessonId: lesson.id,
      sceneId: scene.id,
      index,
      question,
      answer,
      // 演示课程和演示模式都不调用模型，按关键词估分
      model: lesson.demo || isDemoMode ? null : getLearnModel(),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(25_000)]),
    });
    if (!lesson.demo) recordLessonEvent({ lessonId: lesson.id, clientId: client, type: "grade", sceneId: scene.id, value: result.score });
    return reply(result);
  } catch (error) {
    console.error(`[learn] 批改失败 ${lesson.id}/${scene.id}：${error instanceof Error ? error.name : "Error"}`);
    return fail("批改暂时不可用，请对照参考答案自评", 502);
  }
}
