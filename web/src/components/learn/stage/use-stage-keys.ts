"use client";

import { useEffect, useRef } from "react";

// 放映模式的快捷键：空格 / PageDown 显示下一条要点（都显示完了就翻页）、P 播放或暂停、F 全屏。
// 左右方向键翻页由课堂页统一处理。焦点在输入框、按钮、链接上时不响应（按钮本来就会响应空格）。
export function useStageKeys(handlers: { advance?: () => void; play?: () => void; fullscreen?: () => void }) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(target.tagName))) return;
      if (event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        latest.current.advance?.();
      } else if (event.key === "p" || event.key === "P") latest.current.play?.();
      else if (event.key === "f" || event.key === "F") latest.current.fullscreen?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
