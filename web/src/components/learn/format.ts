// 小狮课堂里用到的时间文字

// 课程依据的名称
export const GROUNDING_LABEL = { campus: "校园资料", general: "通用知识", material: "你的资料" } as const;

// 学习时长：不到 1 分钟、n 分钟、n 小时 m 分钟
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "不到 1 分钟";
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

// 列表里的创建时间：刚刚、n 分钟前、n 小时前、昨天、m-d
export function relativeTime(time: number, now = Date.now()): string {
  const diff = Math.max(0, now - time);
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 2 * 86_400_000) return "昨天";
  const date = new Date(time);
  return `${date.getMonth() + 1}-${date.getDate()}`;
}
