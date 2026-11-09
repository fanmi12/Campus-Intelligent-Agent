"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { speakable } from "@/lib/learn/scene-text";

// 讲解播放器：把一页的讲解词（narration）逐段「播」出来，当前段对应的要点会高亮（聚光灯）。
// 两级引擎：浏览器朗读（SpeechSynthesis）→ 字幕（按字数计时推进）。
// 微信内置浏览器的朗读在不同机型上表现不一（安卓可能没有、静默失败，getVoices 常为空；iOS 必须在点击里首次调用），
// 所以字幕模式必须完整可用，朗读失败时自动降级：
// - 第一段 3 秒内没有开始 → 切字幕并通知
// - 某段超过「字数 × 0.35 秒」（至少 8 秒）还没结束 → 强制进入下一段
// - 暂停：手机上 pause/resume 不可靠，统一实现为取消并记住当前段，继续时从当前段重播
// （服务端语音是计划里的可选项 Phase 4B，接口不变）

export type NarrationSegment = { point: number; text: string };
export type NarrationEngine = "speech" | "captions";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// 字幕模式下每段停留的时间：约每字 220 毫秒，语速越快越短，至少 2.5 秒、最多 20 秒
export const captionDuration = (text: string, rate: number) => clamp((speakable(text).length * 220) / rate, 2500, 20_000);
// 朗读时，一段超过这么久还没读完就强制进入下一段（防止 onend 不触发而卡住）
const speechGuard = (text: string, rate: number) => Math.max(8000, (speakable(text).length * 350) / rate);

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
const noopSubscribe = () => () => {};

// 当前浏览器是否支持朗读（服务端渲染时为 false，挂载后才可能为 true，不会造成水合不一致）
export function useCanSpeak(): boolean {
  return useSyncExternalStore(noopSubscribe, canSpeak, () => false);
}

// 从自动翻页进入的新页面应该自动开始播放：翻页前置位，新页面挂载时取走（3 秒内没被取走就作废）
let autoStart = false;
export function requestAutoStart() {
  autoStart = true;
  setTimeout(() => {
    autoStart = false;
  }, 3000);
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => /^zh[-_]CN$/i.test(voice.lang)) ?? voices.find((voice) => /^zh/i.test(voice.lang));
}

type Options = {
  rate: number;
  // 偏好：auto 优先朗读，captions 只用字幕
  voice: "auto" | "captions";
  onFinish?: () => void;
  // 朗读失败自动降级为字幕时通知（页面里提示并把偏好改成字幕）
  onFallback?: () => void;
};

export function useNarration(segments: NarrationSegment[], { rate, voice, onFinish, onFallback }: Options) {
  const [index, setIndex] = useState(-1); // -1：还没开始
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [engine, setEngine] = useState<NarrationEngine>("captions");
  const last = segments.length - 1;

  // 课程在备课期间会被反复轮询，每次拿到的 segments 都是新数组、回调也可能是新函数；
  // 用 ref 取最新值，计时器和朗读回调只依赖播放状态和下标，不会因为重新渲染而被重置
  const latest = useRef({ segments, rate, voice, onFinish, onFallback });
  useEffect(() => {
    latest.current = { segments, rate, voice, onFinish, onFallback };
  });
  // 朗读的「世代」：每次开始新的一段就加一，旧段迟到的回调据此作废
  const token = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const speechFailed = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const cancelSpeech = useCallback(() => {
    token.current += 1;
    clearTimers();
    if (canSpeak()) window.speechSynthesis.cancel();
  }, [clearTimers]);

  const finish = useCallback(() => {
    setPlaying(false);
    setEnded(true);
    latest.current.onFinish?.();
  }, []);

  const fallback = useCallback(() => {
    speechFailed.current = true;
    cancelSpeech();
    setEngine("captions");
    latest.current.onFallback?.();
  }, [cancelSpeech]);

  // 朗读第 i 段（必须在点击处理函数里同步调用过一次，iOS 才允许；之后由 onend 接力）。
  // 用函数声明而不是 useCallback：它要在 onend 里调用自己去读下一段；最新的一份放进 speakRef，供下面的回调使用
  function speak(i: number) {
    const current = latest.current;
    const segment = current.segments[i];
    if (!segment) return;
    window.speechSynthesis.cancel();
    clearTimers();
    const mine = ++token.current;
    const text = speakable(segment.text);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = current.rate;
    const chosen = pickVoice();
    if (chosen) utterance.voice = chosen;
    let started = false;
    const next = () => {
      if (token.current !== mine) return;
      clearTimers();
      if (i < current.segments.length - 1) {
        setIndex(i + 1);
        speak(i + 1);
      } else {
        finish();
      }
    };
    utterance.onstart = () => {
      started = true;
    };
    utterance.onend = next;
    utterance.onerror = (event) => {
      if (token.current !== mine || event.error === "interrupted" || event.error === "canceled") return;
      fallback();
    };
    timers.current.push(
      setTimeout(() => {
        if (token.current === mine && !started) fallback();
      }, 3000),
      setTimeout(next, speechGuard(segment.text, current.rate)),
    );
    window.speechSynthesis.speak(utterance);
  }
  const speakRef = useRef(speak);
  useEffect(() => {
    speakRef.current = speak;
  });

  // 字幕引擎：当前段停留一段时间后进入下一段，最后一段结束后停止并通知
  useEffect(() => {
    if (engine !== "captions" || !playing || index < 0 || index > last) return;
    const timer = setTimeout(() => {
      if (index < last) setIndex(index + 1);
      else finish();
    }, captionDuration(latest.current.segments[index]?.text ?? "", rate));
    return () => clearTimeout(timer);
  }, [engine, playing, index, last, rate, finish]);

  // 朗读降级成字幕后，从当前段接着往下走（playing 仍为 true，上面的计时器会接手）

  const pause = useCallback(() => {
    cancelSpeech();
    setPlaying(false);
  }, [cancelSpeech]);

  // 切到后台就暂停；离开页面时停止朗读
  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      if (canSpeak()) window.speechSynthesis.cancel();
    };
  }, [pause]);

  const play = useCallback(() => {
    if (last < 0) return;
    const start = index < 0 || ended ? 0 : index;
    const useSpeech = latest.current.voice !== "captions" && canSpeak() && !speechFailed.current;
    setEnded(false);
    setIndex(start);
    setPlaying(true);
    setEngine(useSpeech ? "speech" : "captions");
    if (useSpeech) speakRef.current(start);
  }, [last, index, ended]);

  const stop = useCallback(() => {
    cancelSpeech();
    setPlaying(false);
    setEnded(false);
    setIndex(-1);
  }, [cancelSpeech]);

  const jump = useCallback(
    (target: number) => {
      const clamped = clamp(target, 0, last);
      setIndex(clamped);
      if (playing && engine === "speech") speakRef.current(clamped);
    },
    [last, playing, engine],
  );
  const next = useCallback(() => jump(index + 1), [jump, index]);
  const prev = useCallback(() => jump(index - 1), [jump, index]);

  // 从自动翻页进入的页面：挂载后自动开始（只会触发一次）
  useEffect(() => {
    if (!autoStart) return;
    const timer = setTimeout(() => {
      if (!autoStart) return;
      autoStart = false;
      play();
    }, 0);
    return () => clearTimeout(timer);
  }, [play]);

  const current = index >= 0 && index <= last ? segments[index] : undefined;
  return {
    engine,
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
