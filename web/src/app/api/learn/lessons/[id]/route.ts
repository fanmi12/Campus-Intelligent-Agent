import { LESSON_ID } from "@/lib/learn/schema";
import { clientIdOf, disabled, fail, noContent, reply } from "@/lib/server/learn/api";
import { learnJobs, learnQueuePositions } from "@/lib/server/learn/jobs";
import { deleteLesson, getLesson, getLessonOwner, isBuiltinLesson } from "@/lib/server/learn/store";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = "课程不存在或已删除";

// 读取一节课（备课进度、各页内容）。owner 表示当前浏览器是不是创建者，前端据此显示「重新生成 / 删除」
export async function GET(req: Request, { params }: Params) {
  const off = disabled();
  if (off) return off;
  const { id } = await params;
  const lesson = LESSON_ID.test(id) ? getLesson(id) : null;
  if (!lesson) return fail(NOT_FOUND, 404);
  const client = clientIdOf(req);
  const owner = Boolean(client) && getLessonOwner(id) === client;
  const position = learnQueuePositions.get(id);
  return reply({ lesson, owner, ...(position ? { queue: { position } } : {}) });
}

// 删除：只有创建者（同一个浏览器标识）可以；正在生成的任务一并停掉
export async function DELETE(req: Request, { params }: Params) {
  const off = disabled();
  if (off) return off;
  const { id } = await params;
  if (!LESSON_ID.test(id) || !getLesson(id)) return fail(NOT_FOUND, 404);
  const client = clientIdOf(req);
  if (isBuiltinLesson(id) || !client || getLessonOwner(id) !== client) return fail("只有创建者可以删除这节课", 403);
  learnJobs.get(id)?.abort();
  deleteLesson(id);
  return noContent();
}
