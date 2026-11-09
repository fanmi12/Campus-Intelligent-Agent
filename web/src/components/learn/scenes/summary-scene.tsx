"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { scoreOf, weakPoints } from "@/lib/learn/progress";
import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { formatDuration } from "../format";
import { KnowledgeMap } from "../knowledge-map";
import { sendLearnEvent } from "../learn-events";
import { resetProgress, updatePrefs, updateProgress, upsertLocalLesson, usePrefs, useProgress } from "../learn-storage";
import styles from "../learn.module.css";
import { NarrationBar } from "../narration-bar";
import { BasisLine, RichText } from "../source-badges";
import { useNarration } from "../use-narration";
import { SceneHeader } from "./scene-header";

type SummaryScene = Extract<LessonScene, { kind: "summary" }>;

// 学完之后的小结：得分、用时、薄弱点（完整的学习报告在计划的 Phase 3）
function Done({ lesson, onRestart }: { lesson: Lesson; onRestart: () => void }) {
  const progress = useProgress(lesson.id);
  const weak = weakPoints(lesson, progress);
  return (
    <section className={styles.panel} aria-label="学习完成">
      <p className="flex items-center gap-2 text-[17px] font-semibold">
        <Trophy className="size-5 text-gold" />
        这节课学完了
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        {progress.score !== undefined && (
          <div>
            <dt className={styles.muted}>测验得分</dt>
            <dd className="text-2xl font-semibold tabular-nums">{progress.score}</dd>
          </div>
        )}
        <div>
          <dt className={styles.muted}>学习用时</dt>
          <dd className="text-2xl font-semibold">{formatDuration(progress.activeMs)}</dd>
        </div>
      </dl>
      {weak.length > 0 && (
        <p className="mt-3 text-sm leading-7">
          建议再看看：<strong>{weak.join("、")}</strong>
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <Link href="/learn" className={buttonVariants({ size: "lg" })}>
          回到小狮课堂
        </Link>
        <Button variant="ghost" onClick={onRestart}>
          重新学一遍
        </Button>
      </div>
    </section>
  );
}

export function SummaryScene({ scene, lesson }: { scene: SummaryScene; lesson: Lesson }) {
  const content = scene.content!;
  const progress = useProgress(lesson.id);
  const prefs = usePrefs();
  const narration = useNarration(content.narration, {
    rate: prefs.rate,
    voice: prefs.voice,
    onFallback: () => {
      toast.info("当前浏览器不支持朗读，已切换为字幕模式");
      updatePrefs({ voice: "captions" });
    },
  });
  const started = narration.index >= 0;
  const active = narration.activePoint;
  const finished = progress.finishedAt !== undefined;

  useEffect(() => {
    if (narration.playing && active >= 0) {
      document.getElementById(`recap-${scene.id}-${active}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [narration.playing, active, scene.id]);

  function finish() {
    const score = scoreOf(lesson, progress);
    const now = Date.now();
    updateProgress(lesson.id, (current) => ({
      ...current,
      finishedAt: now,
      score: score ?? undefined,
      completed: current.completed.includes(scene.id) ? current.completed : [...current.completed, scene.id],
    }));
    upsertLocalLesson({ id: lesson.id, completedAt: now, score: score ?? undefined });
    sendLearnEvent({ lessonId: lesson.id, type: "finish", value: score ?? undefined });
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5">
        <SceneHeader kind="summary" title={scene.title} />
        <ol className={styles.recap}>
          {content.recap.map((item, index) => (
            <li
              key={index}
              id={`recap-${scene.id}-${index}`}
              className={styles.point}
              data-active={started && active === index}
              data-dim={started && active >= 0 && active !== index}
            >
              <span className={styles.pointIndex} aria-hidden>
                {index + 1}
              </span>
              <p className={`${styles.pointBody} mt-0 min-w-0 flex-1`}>
                <RichText text={item} />
              </p>
            </li>
          ))}
        </ol>
        <section className="flex flex-col gap-2.5">
          <h3 className="text-[15px] font-semibold">知识结构</h3>
          <KnowledgeMap nodes={content.map} />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">下一步</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-7">
            {content.nextSteps.map((step, index) => (
              <li key={index}>
                <RichText text={step} />
              </li>
            ))}
          </ul>
        </section>
        <BasisLine grounding={lesson.grounding} sourceCount={lesson.sources.length} />
        {finished ? (
          <Done lesson={lesson} onRestart={() => resetProgress(lesson.id)} />
        ) : (
          <Button size="lg" onClick={finish}>
            完成课程
          </Button>
        )}
      </div>
      <NarrationBar narration={narration} label="播放总结" showAutoAdvance={false} />
    </>
  );
}
