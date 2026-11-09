"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speakable } from "@/lib/learn/scene-text";

// 讲解播放器：把一页的讲解词（narration）逐段「播」出来，当前段对应的要点会高亮（聚光灯）。
// 三级降级：服务端语音（可选）→ 浏览器朗读 → 字幕。微信内置浏览器的朗读在不同机型上表现不一，
// 所以字幕模式必须完整可用。目前实现的是字幕引擎（按字数计时推进）；朗读引擎在计划的 Phase 2 接入，接口不变。

export type NarrationSegment = { point: number; text: string };
export type NarrationEngine = "speech" | "captions";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// 字幕模式下每段停留的时间：约每字 220 毫秒，语速越快越短，至少 2.5 秒、最多 20 秒
export const captionDuration = (text: string, rate: number) => clamp((speakable(text).length * 220) / rate, 2500, 20_000);

export function useNarration(segments: NarrationSegment[], { rate, onFinish }: { rate: number; onFinish?: () => void }) {
  const [index, setIndex] = useState(-1); // -1：还没开始
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const last = segments.length - 1;

  // 课程在备课期间会被反复轮询，每次拿到的 segments 都是新数组、回调也可能是新函数；
  // 用 ref 取最新值，计时器只依赖播放状态和下标，不会因为重新渲染而被重置
  const latest = useRef({ segments, onFinish });
  useEffect(() => {
    latest.current = { segments, onFinish };
  });

  // 字幕引擎：当前段停留一段时间后进入下一段，最后一段结束后停止并通知
  useEffect(() => {
    if (!playing || index < 0 || index > last) return;
    const timer = setTimeout(() => {
      if (index < last) {
        setIndex(index + 1);
      } else {
        setPlaying(false);
        setEnded(true);
        latest.current.onFinish?.();
      }
    }, captionDuration(latest.current.segments[index]?.text ?? "", rate));
    return () => clearTimeout(timer);
  }, [playing, index, last, rate]);

  // 切到后台就暂停
  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  const play = useCallback(() => {
    if (last < 0) return;
    setIndex((current) => (current < 0 || ended ? 0 : current));
    setEnded(false);
    setPlaying(true);
  }, [last, ended]);

  const pause = useCallback(() => setPlaying(false), []);

  const stop = useCallback(() => {
    setPlaying(false);
    setEnded(false);
    setIndex(-1);
  }, []);

  const next = useCallback(() => setIndex((current) => Math.min(last, current + 1)), [last]);
  const prev = useCallback(() => setIndex((current) => Math.max(0, current - 1)), []);

  const current = index >= 0 && index <= last ? segments[index] : undefined;
  return {
    engine: "captions" as NarrationEngine,
    playing,
    ended,
    index,
    total: last + 1,
    // 当前讲到哪个要点；-1 表示开场、过渡或还没开始
    activePoint: current ? current.point : -1,
    caption: current ? current.text : "",
    play,
    pause,
    stop,
    next,
    prev,
  };
}

export type Narration = ReturnType<typeof useNarration>;
