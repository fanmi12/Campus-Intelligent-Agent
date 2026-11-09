import { ChatQueue, type QueueMessages, type QueueOwner } from "../chat-queue";
import { env } from "../env";
import { countRecentByClient, hasActiveLesson } from "./store";

// 课程生成队列与配额。同时生成的课程数很少（默认 2），多出来的排队；
// 每个浏览器同时只能有一节课在备课，24 小时内最多 LEARN_DAILY_LIMIT 节。
// 队列挂在 globalThis 上：开发模式下不同路由各自加载模块时仍共用同一个队列。

declare global {
  var __campusLessonQueue: ChatQueue | undefined;
}

const LESSON_QUEUE_MESSAGES: QueueMessages = {
  full: "正在备课的同学太多了，请稍后再试",
  clientBusy: "你还有一节课正在备课，请等它完成",
  clientTooFast: "操作有点快，请稍后再试",
  ipBusy: "当前网络下备课的人太多了，请稍后再试",
  cancelled: "已取消备课",
  waitTimeout: "排队等待太久了，请稍后再试",
};

export const lessonQueue = (globalThis.__campusLessonQueue ??= new ChatQueue(
  env.learn.concurrency, // 同时生成的课程数，默认 2
  20, // 全站每分钟最多开始 20 节
  env.learn.queueCapacity, // 排队上限，默认 20
  60_000,
  8 * 60_000, // 最多等 8 分钟
  // 校园网、现场 Wi-Fi 共用出口，perIp 默认 20
  { perClient: 1, perClientPerMinute: 3, perIp: env.learn.ipActiveLimit },
  LESSON_QUEUE_MESSAGES,
));

// 创建课程前检查：返回给同学看的拒绝原因，通过则返回 null
export function checkLessonQuota(owner: QueueOwner): string | null {
  if (hasActiveLesson(owner.client)) return LESSON_QUEUE_MESSAGES.clientBusy;
  if (countRecentByClient(owner.client, Date.now() - 86_400_000) >= env.learn.dailyLimit) return "今天生成的课程有点多了，明天再来吧";
  return lessonQueue.check(owner);
}
