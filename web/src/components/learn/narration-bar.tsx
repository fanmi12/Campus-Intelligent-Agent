"use client";

import { Captions, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { speakable } from "@/lib/learn/scene-text";
import { BrandAvatar } from "@/components/chat/brand-avatar";
import styles from "./learn.module.css";
import type { Narration } from "./use-narration";

// 字幕条 + 播放控制：显示狮老师正在讲的这一句，当前要点会在上方高亮
export function NarrationBar({ narration, label = "播放讲解" }: { narration: Narration; label?: string }) {
  const { playing, ended, index, total, caption } = narration;
  const started = index >= 0;
  return (
    <section className={styles.narration} aria-label="狮老师讲解">
      <div className={styles.caption}>
        <BrandAvatar size="sm" className="mt-0.5" />
        {/* 字幕用 aria-live，读屏软件会跟着念；还没开始时显示提示 */}
        <p aria-live="polite" className={started ? "min-w-0 flex-1" : `min-w-0 flex-1 ${styles.captionHint}`}>
          {started ? speakable(caption) : `点「${label}」，听狮老师一句一句讲这一页；也可以直接看上面的内容。`}
        </p>
      </div>
      <div className={styles.controls}>
        <Button variant="ghost" size="icon" aria-label="上一句" disabled={!started || index === 0} onClick={narration.prev}>
          <SkipBack />
        </Button>
        {playing ? (
          <Button onClick={narration.pause} aria-label="暂停讲解">
            <Pause />
            暂停
          </Button>
        ) : (
          <Button onClick={narration.play} aria-label={ended ? "重新播放讲解" : label}>
            {ended ? <RotateCcw /> : <Play />}
            {ended ? "再听一遍" : started ? "继续" : label}
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="下一句" disabled={!started || index >= total - 1} onClick={narration.next}>
          <SkipForward />
        </Button>
        <span className={styles.spacer} />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Captions className="size-3.5" />
          {started ? `${index + 1}/${total}` : "字幕"}
        </span>
      </div>
    </section>
  );
}
