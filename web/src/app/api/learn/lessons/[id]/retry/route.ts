import { LESSON_ID } from "@/lib/learn/schema";
import { disabled, fail, ownerOf, reply } from "@/lib/server/learn/api";
import { isLessonRunning } from "@/lib/server/learn/jobs";
import { lessonQueue } from "@/lib/server/learn/quota";
import { resumeLesson } from "@/lib/server/learn/start";
import { getLesson, getLessonOwner, getMaterial, isBuiltinLesson } from "@/lib/server/learn/store";

type Params = { params: Promise<{ id: string }> };

// 重新生成：失败的页（或从头）再来一遍，已经好的页保留。只有创建者可以
export async function POST(req: Request, { params }: Params) {
  const off = disabled();
  if (off) return off;
  const { id } = await params;
  const lesson = LESSON_ID.test(id) ? getLesson(id) : null;
  if (!lesson) return fail("课程不存在或已删除", 404);
  const owner = ownerOf(req);
  if (!owner || isBuiltinLesson(id) || getLessonOwner(id) !== owner.client) return fail("只有创建者可以重新生成", 403);
  if (lesson.status === "generating" || isLessonRunning(id)) return fail("这节课还在备课中，请稍等", 409);
  if (lesson.status === "ready" && lesson.scenes.every((scene) => scene.status === "ready")) return fail("这节课已经完成，没有需要重新生成的页面", 409);
  // 基于用户资料的课程，资料超过保存期限被清掉后没法再生成
  if (lesson.grounding === "material" && !getMaterial(id)) return fail("资料已过期，请重新创建这节课", 410);
  const refused = lessonQueue.check(owner);
  if (refused) return fail(refused, 429);

  resumeLesson(lesson, owner);
  return reply({ id, status: "generating" }, 202);
}
