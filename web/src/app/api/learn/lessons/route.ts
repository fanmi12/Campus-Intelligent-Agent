import { createLessonRequestSchema, LESSON_ID } from "@/lib/learn/schema";
import { disabled, fail, firstMessage, ownerOf, reply } from "@/lib/server/learn/api";
import { LessonRefusedError, startLesson } from "@/lib/server/learn/start";
import { listSummaries } from "@/lib/server/learn/store";

export const dynamic = "force-dynamic";

// 创建一节课：立即返回课程 id，生成在服务端后台进行，前端轮询 GET /api/learn/lessons/[id]
export async function POST(req: Request) {
  const off = disabled();
  if (off) return off;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return fail("请求格式不正确", 400);
  }
  const parsed = createLessonRequestSchema.safeParse(payload);
  if (!parsed.success) return fail(firstMessage(parsed.error.issues), 400);
  const owner = ownerOf(req);
  if (!owner) return fail("请刷新页面后再试", 400);

  try {
    return reply(startLesson(parsed.data, owner), 202);
  } catch (error) {
    if (error instanceof LessonRefusedError) return fail(error.message, error.status);
    console.error("[learn] 创建课程失败：", error instanceof Error ? error.message : error);
    return fail("创建课程失败，请稍后再试", 500);
  }
}

// 批量读取摘要（「我的课程」列表用）：?ids=a,b，最多 30 个，不存在的跳过
export async function GET(req: Request) {
  const off = disabled();
  if (off) return off;
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return fail("缺少课程编号", 400);
  if (ids.length > 30) return fail("一次最多查询 30 节课", 400);
  return reply({ items: listSummaries(ids.filter((id) => LESSON_ID.test(id))) });
}
