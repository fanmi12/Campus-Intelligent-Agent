"use client";

import { useCallback, useEffect, useState } from "react";
import { getClientId } from "@/components/chat/storage";
import type { Lesson } from "@/lib/learn/schema";
import { upsertLocalLesson } from "./learn-storage";

// 读取一节课，并在备课中时轮询进度：
// 前 60 秒每 1.5 秒一次，之后放慢到 3 秒；页面隐藏时只保持低频检查；网络出错指数退避；ready / failed 后停止

export type LessonState = {
  lesson: Lesson;
  owner: boolean; // 当前浏览器是不是创建者
  queuePosition?: number; // 排队中：前面还有几节课（含自己）
  offline: boolean; // 最近一次请求失败
  missing: boolean; // 服务器上已经没有这节课
};

export function useLesson(initial: Lesson) {
  const id = initial.id;
  const [state, setState] = useState<LessonState>({ lesson: initial, owner: false, offline: false, missing: false });
  // 点「重新生成」后让轮询重新开始
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const started = Date.now();

    async function tick() {
      if (cancelled) return;
      if (document.hidden) {
        timer = setTimeout(tick, 2000);
        return;
      }
      let generating = true;
      try {
        const response = await fetch(`/api/learn/lessons/${id}`, { headers: { "X-Client-Id": getClientId() }, cache: "no-store" });
        if (cancelled) return;
        if (response.status === 404) {
          setState((current) => ({ ...current, missing: true, offline: false }));
          upsertLocalLesson({ id, gone: true });
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { lesson: Lesson; owner: boolean; queue?: { position: number } };
        if (cancelled) return;
        failures = 0;
        generating = data.lesson.status === "generating";
        setState({ lesson: data.lesson, owner: data.owner, queuePosition: data.queue?.position, offline: false, missing: false });
      } catch {
        failures += 1;
        if (!cancelled) setState((current) => (current.offline ? current : { ...current, offline: true }));
      }
      if (!generating || cancelled) return;
      const delay = failures ? Math.min(15_000, 1500 * 2 ** failures) : Date.now() - started > 60_000 ? 3000 : 1500;
      timer = setTimeout(tick, delay);
    }

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, round]);

  // 创建者打开的课程记进「我的课程」；进度变化时同步状态
  const { lesson, owner } = state;
  useEffect(() => {
    if (!owner) return;
    upsertLocalLesson({
      id,
      title: lesson.title,
      topic: lesson.topic,
      createdAt: lesson.createdAt,
      status: lesson.status,
      done: lesson.scenes.filter((scene) => scene.status === "ready").length,
      total: lesson.scenes.length,
      gone: false,
    });
  }, [id, owner, lesson.title, lesson.topic, lesson.createdAt, lesson.status, lesson.scenes]);

  const restart = useCallback(() => setRound((value) => value + 1), []);
  const patch = useCallback((change: Partial<LessonState>) => setState((current) => ({ ...current, ...change })), []);
  return { ...state, restart, patch };
}
