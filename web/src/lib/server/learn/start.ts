import { after } from "next/server";
import { DEMO_LESSON_ID } from "@/lib/learn/fixtures";
import type { CreateLessonRequest, Lesson, LessonStatus } from "@/lib/learn/schema";
import type { QueueOwner } from "../chat-queue";
import { isDemoMode } from "../env";
import { runLessonGeneration } from "./generate";
import { checkLessonQuota } from "./quota";
import { createLessonRecord, purgeExpiredMaterials, saveLesson } from "./store";

// 创建 / 重新生成课程的入口：POST 接口和聊天里的 createLesson 工具共用。
// 生成本身在 generate.ts，这里只负责配额检查、建记录和在响应结束后调度后台任务。

// 因为配额、排队等原因被拒绝；message 是给同学看的中文短句
export class LessonRefusedError extends Error {
  constructor(message: string, readonly status = 429) {
    super(message);
  }
}

// 响应结束后在后台运行。after() 只在请求上下文里可用；万一不可用，直接放到后台跑
// （runLessonGeneration 本身永不抛错）
function schedule(task: () => Promise<void>) {
  try {
    after(task);
  } catch (error) {
    console.error("[learn] after() 不可用，改为直接在后台运行：", error instanceof Error ? error.message : error);
    void task();
  }
}

export function startLesson(request: CreateLessonRequest, owner: QueueOwner): { id: string; status: LessonStatus } {
  // 演示模式不调用模型：直接给示例课程
  if (isDemoMode) return { id: DEMO_LESSON_ID, status: "ready" };
  const refused = checkLessonQuota(owner);
  if (refused) throw new LessonRefusedError(refused);
  purgeExpiredMaterials();
  const lesson = createLessonRecord({
    topic: request.topic,
    level: request.level,
    minutes: request.minutes,
    grounding: request.grounding,
    clientId: owner.client,
    material: request.material,
    hasImages: Boolean(request.images?.length),
  });
  // 图片只在内存里传给生成任务，不入库
  schedule(() => runLessonGeneration(lesson.id, { owner, images: request.images }));
  return { id: lesson.id, status: "generating" };
}

// 重新生成失败的页（或从头再来）：先把状态改成「生成中」，前端马上能看到
export function resumeLesson(lesson: Lesson, owner: QueueOwner): void {
  lesson.status = "generating";
  lesson.step = "queued";
  delete lesson.error;
  lesson.scenes = lesson.scenes.map((scene) => (scene.status === "ready" ? scene : { ...scene, status: "pending" as const, error: undefined }));
  saveLesson(lesson);
  schedule(() => runLessonGeneration(lesson.id, { owner, resume: true }));
}
