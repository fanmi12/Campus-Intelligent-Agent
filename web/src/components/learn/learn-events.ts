import { getClientId } from "@/components/chat/storage";

// 学习行为上报（匿名，供后台统计）：用 sendBeacon，页面关闭时也能发出去；
// sendBeacon 没法带自定义请求头，所以浏览器标识放在请求体里。失败不影响学习，静默忽略。
export type LearnEventType = "view" | "scene" | "finish" | "review";

const sent = new Set<string>();

export function sendLearnEvent(event: { lessonId: string; type: LearnEventType; sceneId?: string; value?: number }, { once = false } = {}) {
  try {
    if (once) {
      const key = `${event.type}:${event.lessonId}:${event.sceneId ?? ""}`;
      if (sent.has(key)) return;
      sent.add(key);
    }
    const body = JSON.stringify({ clientId: getClientId(), ...event });
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator && navigator.sendBeacon("/api/learn/events", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/learn/events", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // 上报失败不影响学习
  }
}
