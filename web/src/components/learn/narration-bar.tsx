"use client";

import { Captions, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { BrandAvatar } from "@/components/chat/brand-avatar";
import { Button } from "@/components/ui/button";
import { speakable } from "@/lib/learn/scene-text";
import { updatePrefs, usePrefs } from "./learn-storage";
import styles from "./learn.module.css";
import { useCanSpeak, type Narration } from "./use-narration";

const RATES = [0.9, 1, 1.2] as const;

// 字幕条 + 播放控制：显示狮老师正在讲的这一句，当前要点会在上方高亮。
// 可以切换朗读 / 字幕、调语速、开关「播完自动翻页」（偏好存在浏览器本地）
export function NarrationBar({ narration, label = "播放讲解", showAutoAdvance = true }: { narration: Narration; label?: string; showAutoAdvance?: boolean }) {
  const { playing, ended, index, total, caption, engine } = narration;
  const prefs = usePrefs();
  const canSpeak = useCanSpeak();
  const started = index >= 0;
  const speech = canSpeak && prefs.voice !== "captions";
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
        <span className="text-xs text-muted-foreground" aria-live="off">
          {started ? `${index + 1}/${total}` : ""}
        </span>
      </div>
      <div className={styles.narrationOptions}>
        {canSpeak ? (
          <button
            type="button"
            className={styles.chipSm}
            aria-pressed={speech}
            aria-label={speech ? "当前是朗读模式，点击改为字幕" : "当前是字幕模式，点击改为朗读"}
            onClick={() => updatePrefs({ voice: speech ? "captions" : "auto" })}
          >
            {speech ? <Volume2 className="size-3.5" /> : <Captions className="size-3.5" />}
            {speech ? "朗读" : "字幕"}
          </button>
        ) : (
          <span className={styles.chipSm} data-static="true" title="当前浏览器不支持朗读">
            <Captions className="size-3.5" />
            字幕
          </span>
        )}
        <button
          type="button"
          className={styles.chipSm}
          aria-label={`语速 ${prefs.rate} 倍，点击切换`}
          onClick={() => updatePrefs({ rate: RATES[(RATES.indexOf(prefs.rate) + 1) % RATES.length] })}
        >
          {prefs.rate}x
        </button>
        {showAutoAdvance && (
          <button type="button" className={styles.chipSm} aria-pressed={prefs.autoAdvance} onClick={() => updatePrefs({ autoAdvance: !prefs.autoAdvance })}>
            自动翻页{prefs.autoAdvance ? "：开" : ""}
          </button>
        )}
        {started && engine === "captions" && canSpeak && prefs.voice !== "captions" && <span className="text-xs text-muted-foreground">已改用字幕</span>}
      </div>
    </section>
  );
}
