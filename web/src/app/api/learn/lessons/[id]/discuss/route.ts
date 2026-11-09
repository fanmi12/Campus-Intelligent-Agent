import { LESSON_ID } from "@/lib/learn/schema";
import { discussRequestSchema, encodeEvent, type DiscussEvent } from "@/lib/learn/stream";
import { getLearnModel } from "@/lib/server/ai/models";
import { chatQueue, ChatQueueError } from "@/lib/server/chat-queue";
import { isDemoMode } from "@/lib/server/env";
import { disabled, fail, firstMessage, ownerOf } from "@/lib/server/learn/api";
import { runDiscussion } from "@/lib/server/learn/discuss";
import { getLesson, isBuiltinLesson, recordLessonEvent } from "@/lib/server/learn/store";

type Params = { params: Promise<{ id: string }> };

// 课堂讨论（mode=discuss）和问狮老师（mode=ask）。响应是 NDJSON 流：turn / delta / end / done（见 lib/learn/stream.ts）。
// 与聊天共用同一个排队队列（容量和每人限额不翻倍）；客户端断开后立即停止生成
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
  const parsed = discussRequestSchema.safeParse(payload);
  if (!parsed.success) return fail(firstMessage(parsed.error.issues), 400);
  const { sceneId, mode, message, history } = parsed.data;
  const owner = ownerOf(req);
  if (!owner) return fail("请刷新页面后再试", 400);

  const scene = lesson.scenes.find((item) => item.id === sceneId);
  if (!scene) return fail("这一页不存在", 404);
  if (scene.status !== "ready" || !scene.content) return fail("这一页还没准备好", 409);
  if (mode === "discuss" && scene.kind !== "discussion") return fail("这一页不是讨论页", 400);

  const refused = chatQueue.check(owner);
  if (refused) return fail(refused, 429);

  if (!isBuiltinLesson(lesson.id)) recordLessonEvent({ lessonId: lesson.id, clientId: owner.client, type: "discuss", sceneId });

  const cancellation = new AbortController();
  const signal = AbortSignal.any([req.signal, cancellation.signal, AbortSignal.timeout(90_000)]);
  const model = isDemoMode ? null : getLearnModel();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (event: DiscussEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          closed = true;
        }
      };
      let release: (() => void) | undefined;
      try {
        release = await chatQueue.acquire(
          signal,
          (state) => {
            if (state.status === "waiting") send({ type: "queue", position: state.position });
          },
          owner,
        );
        await runDiscussion({ lesson, scene, mode, message, history, model, signal, emit: send });
      } catch (error) {
        send({ type: "error", message: error instanceof ChatQueueError ? error.message : "狮老师暂时没能回应，请稍后再试" });
      } finally {
        release?.();
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // 客户端已经断开
          }
        }
      }
    },
    cancel() {
      cancellation.abort();
    },
  });

  // Content-Encoding: none 沿用聊天接口的做法：防止中间的代理压缩响应，导致发言攒到最后才一起返回
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no",
    },
  });
}
