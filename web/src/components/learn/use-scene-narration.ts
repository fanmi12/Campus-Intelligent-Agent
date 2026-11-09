"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { updatePrefs, usePrefs } from "./learn-storage";
import { requestAutoStart, useNarration, type NarrationSegment } from "./use-narration";

// 一页讲解词的播放：把偏好（语速、朗读 / 字幕）、朗读失败时的提示、播完自动翻页这些每页都一样的接线放在一起。
// autoAdvance：播完自动翻页（偏好，默认关）：停 1.5 秒再翻，下一页自动开始播放。总结页是最后一页，不传。
export function useSceneNarration(segments: NarrationSegment[], autoAdvance?: { hasNext: boolean; onNext: () => void }) {
  const prefs = usePrefs();
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(advance.current), []);
  return useNarration(segments, {
    rate: prefs.rate,
    voice: prefs.voice,
    onFinish: () => {
      if (!autoAdvance || !prefs.autoAdvance || !autoAdvance.hasNext) return;
      advance.current = setTimeout(() => {
        requestAutoStart();
        autoAdvance.onNext();
      }, 1500);
    },
    onFallback: () => {
      toast.info("当前浏览器不支持朗读，已切换为字幕模式");
      updatePrefs({ voice: "captions" });
    },
  });
}
