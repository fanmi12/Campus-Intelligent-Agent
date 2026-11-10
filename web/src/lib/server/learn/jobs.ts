// 正在生成的课程登记表。Next 在开发模式下不同路由可能各自加载一份模块，
// 所以必须挂在 globalThis 上（同 db.ts 的 __campusDb）。

declare global {
  var __campusLearnJobs: Map<string, AbortController> | undefined;
  var __campusLearnQueuePositions: Map<string, number> | undefined;
}

// 正在生成的课程：用于防止重复生成、判断「备课中断」
export const learnJobs = (globalThis.__campusLearnJobs ??= new Map<string, AbortController>());
// 排队中的课程前面还有几节：GET 接口合并进响应的 queue.position
export const learnQueuePositions = (globalThis.__campusLearnQueuePositions ??= new Map<string, number>());

export const isLessonRunning = (id: string) => learnJobs.has(id);
