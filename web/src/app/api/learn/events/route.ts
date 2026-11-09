import { z } from "zod";
import { LESSON_ID } from "@/lib/learn/schema";
import { rateLimit } from "@/lib/server/rate-limit";
import { CLIENT_ID, disabled, fail, noContent } from "@/lib/server/learn/api";
import { getLesson, incrementViews, isBuiltinLesson, recordLessonEvent } from "@/lib/server/learn/store";

// 学习行为上报（匿名）：用 navigator.sendBeacon 发送，没法带自定义请求头，所以浏览器标识放在请求体里。
// 批改、讨论由服务端自己记录，这里只收前端才知道的几种
const eventSchema = z.object({
  clientId: z.string().regex(CLIENT_ID),
  lessonId: z.string().regex(LESSON_ID),
  type: z.enum(["view", "scene", "finish", "review"]),
  sceneId: z.string().regex(/^[\w-]{1,16}$/).optional(),
  value: z.number().min(0).max(100).optional(),
});

export async function POST(req: Request) {
  const off = disabled();
  if (off) return off;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return fail("请求格式不正确", 400);
  }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return fail("请求格式不正确", 400);
  const event = parsed.data;
  if (!rateLimit(`learn-events:${event.clientId}`, 60)) return fail("操作有点快，请稍后再试", 429);
  // 内置的示例课程不统计；已被删除的课程也不记
  if (!isBuiltinLesson(event.lessonId) && getLesson(event.lessonId)) {
    recordLessonEvent(event);
    if (event.type === "view") incrementViews(event.lessonId);
  }
  return noContent();
}
