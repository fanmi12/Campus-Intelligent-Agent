"use client";

import { useSyncExternalStore } from "react";
import { usePrefs } from "../learn-storage";

// 放映模式：把课堂铺成 16:9 的舞台（要点逐条出现、图和例题放在右栏），屏幕要够宽才有意义。
// 宽度够（电脑、平板横屏）时默认开启，用户可以在顶栏关掉；手机上始终是单列的课堂页。
const QUERY = "(min-width: 900px) and (min-height: 540px)";

function subscribe(listener: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

// 服务端渲染时还不知道屏幕多宽：返回 null，页面先不显示课堂内容（避免先画手机布局再跳成舞台）
export function useStageMode(): { available: boolean; active: boolean } | null {
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => null,
  );
  const prefs = usePrefs();
  if (wide === null) return null;
  return { available: wide, active: wide && prefs.stage !== "off" };
}

// 全屏：整个课堂页一起进入全屏（含顶栏和字幕条）；iPhone 上的 Safari 不支持，按钮就不显示
export const canFullscreen = () => typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
}

const noopSubscribe = () => () => {};
export function useCanFullscreen(): boolean {
  return useSyncExternalStore(noopSubscribe, canFullscreen, () => false);
}

function subscribeFullscreen(listener: () => void) {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}
export function useIsFullscreen(): boolean {
  return useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);
}
