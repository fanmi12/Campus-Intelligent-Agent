"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./stage.module.css";

export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

// 舞台：固定 1280×720 的画布，按视口大小等比缩放、居中。画布里的版式不随屏幕宽度变，
// 所以同一页在任何电脑上看到的排版都一样，内容放不放得下也只量一次（见 fit.ts）。
// onAdvance：点击舞台空白处（不是按钮、链接、图里的滑块）时调用，用来显示下一条要点。
export function StageFrame({ children, onAdvance, tip }: { children: ReactNode; onAdvance?: () => void; tip?: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // ResizeObserver 挂上去就会触发一次，首次测量也走这里
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setScale(Math.max(0.2, Math.min((width - 24) / STAGE_WIDTH, (height - 12) / STAGE_HEIGHT)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={viewport} className={styles.viewport}>
      {tip && <p className={styles.tip}>{tip}</p>}
      <div
        className={styles.canvas}
        style={{ transform: `scale(${scale})` }}
        onClick={(event) => {
          if (!onAdvance) return;
          if ((event.target as HTMLElement).closest("button, a, input, textarea, select, summary, figure")) return;
          onAdvance();
        }}
      >
        {children}
      </div>
    </div>
  );
}
