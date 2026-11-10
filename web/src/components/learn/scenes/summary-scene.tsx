"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { KnowledgeMap } from "../knowledge-map";
import styles from "../learn.module.css";
import { LessonReport } from "../lesson-report";
import { NarrationBar } from "../narration-bar";
import { BasisLine, RichText } from "../source-badges";
import { useFinishLesson } from "../use-finish-lesson";
import { useSceneNarration } from "../use-scene-narration";
import { SceneHeader } from "./scene-header";

type SummaryScene = Extract<LessonScene, { kind: "summary" }>;

export function SummaryScene({ scene, lesson }: { scene: SummaryScene; lesson: Lesson }) {
  const content = scene.content!;
  const narration = useSceneNarration(content.narration);
  const started = narration.index >= 0;
  const active = narration.activePoint;
  const { finished, finish } = useFinishLesson(lesson, scene.id);

  useEffect(() => {
    if (narration.playing && active >= 0) {
      document.getElementById(`recap-${scene.id}-${active}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [narration.playing, active, scene.id]);

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
          <LessonReport lesson={lesson} />
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
