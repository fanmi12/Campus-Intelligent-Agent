"use client";

import { Captions, ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { BrandAvatar } from "@/components/chat/brand-avatar";
import { Button } from "@/components/ui/button";
import { speakable } from "@/lib/learn/scene-text";
import { updatePrefs, usePrefs } from "../learn-storage";
import learn from "../learn.module.css";
import { useCanSpeak, type Narration } from "../use-narration";
import styles from "./stage.module.css";
import { toggleFullscreen, useCanFullscreen, useIsFullscreen } from "./use-stage-mode";

const RATES = [0.9, 1, 1.2] as const;

// 舞台下面的控制条：字幕（狮老师正在讲的这一句）、播放控制、语速、翻页、全屏。
// 没有讲解词的页面（测验、闪卡、讨论）不传 narration，只剩翻页和全屏。
export function StageDock({
  narration,
  playLabel = "播放讲解",
  index,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  primary,
  showAutoAdvance = true,
}: {
  narration?: Narration;
  playLabel?: string;
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  // 最后一页用它代替「下一页」（完成课程）
  primary?: { label: string; onClick: () => void };
  showAutoAdvance?: boolean;
}) {
  const prefs = usePrefs();
  const canSpeak = useCanSpeak();
  const canFullscreen = useCanFullscreen();
  const fullscreen = useIsFullscreen();
  const started = narration ? narration.index >= 0 : false;
  const speech = canSpeak && prefs.voice !== "captions";
  return (
    <section className={styles.dock} aria-label="播放控制">
      <div className={styles.dockInner}>
        {narration && (
          <div className={styles.caption}>
            <BrandAvatar size="sm" className="mt-0.5" />
            {/* 字幕用 aria-live，读屏软件会跟着念；还没开始时显示提示 */}
            <p aria-live="polite" className={started ? styles.captionText : `${styles.captionText} ${styles.captionHint}`}>
              {started ? speakable(narration.caption) : `点「${playLabel}」，听狮老师一句一句讲这一页；也可以直接看上面的内容。`}
            </p>
          </div>
        )}
        <div className={styles.controls}>
          {narration && (
            <>
              <Button variant="ghost" size="icon" aria-label="上一句" disabled={!started || narration.index === 0} onClick={narration.prev}>
                <SkipBack />
              </Button>
              {narration.playing ? (
                <Button onClick={narration.pause} aria-label="暂停讲解">
                  <Pause />
                  暂停
                </Button>
              ) : (
                <Button onClick={narration.play} aria-label={narration.ended ? "重新播放讲解" : playLabel}>
                  {narration.ended ? <RotateCcw /> : <Play />}
                  {narration.ended ? "再听一遍" : started ? "继续" : playLabel}
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="下一句" disabled={!started || narration.index >= narration.total - 1} onClick={narration.next}>
                <SkipForward />
              </Button>
              <span className={styles.counter} aria-live="off">
                {started ? `${narration.index + 1}/${narration.total}` : ""}
              </span>
              {canSpeak ? (
                <button
                  type="button"
                  className={learn.chipSm}
                  aria-pressed={speech}
                  aria-label={speech ? "当前是朗读模式，点击改为字幕" : "当前是字幕模式，点击改为朗读"}
                  onClick={() => updatePrefs({ voice: speech ? "captions" : "auto" })}
                >
                  {speech ? <Volume2 className="size-3.5" /> : <Captions className="size-3.5" />}
                  {speech ? "朗读" : "字幕"}
                </button>
              ) : (
                <span className={learn.chipSm} data-static="true" title="当前浏览器不支持朗读">
                  <Captions className="size-3.5" />
                  字幕
                </span>
              )}
              <button type="button" className={learn.chipSm} aria-label={`语速 ${prefs.rate} 倍，点击切换`} onClick={() => updatePrefs({ rate: RATES[(RATES.indexOf(prefs.rate) + 1) % RATES.length] })}>
                {prefs.rate}x
              </button>
              {showAutoAdvance && (
                <button type="button" className={learn.chipSm} aria-pressed={prefs.autoAdvance} onClick={() => updatePrefs({ autoAdvance: !prefs.autoAdvance })}>
                  自动翻页{prefs.autoAdvance ? "：开" : ""}
                </button>
              )}
            </>
          )}
          <span className={styles.spacer} />
          <Button variant="outline" onClick={onPrev} disabled={!hasPrev}>
            <ChevronLeft />
            上一页
          </Button>
          <span className={styles.counter} aria-live="polite">
            {index + 1} / {total}
          </span>
          {primary ? (
            <Button onClick={primary.onClick}>{primary.label}</Button>
          ) : (
            <Button onClick={onNext} disabled={!hasNext}>
              下一页
              <ChevronRight />
            </Button>
          )}
          {canFullscreen && (
            <Button variant="ghost" size="icon" aria-label={fullscreen ? "退出全屏" : "全屏"} title={fullscreen ? "退出全屏（F）" : "全屏（F）"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize /> : <Maximize />}
            </Button>
          )}
        </div>
        {narration && <p className={styles.hint}>空格：下一条要点　←/→：翻页　P：播放/暂停　F：全屏</p>}
      </div>
    </section>
  );
}
