"use client";

import { useRef } from "react";
import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { BasisLine, RichText } from "../source-badges";
import { useFinishLesson } from "../use-finish-lesson";
import { useSceneNarration } from "../use-scene-narration";
import { useFitScene } from "./fit";
import { StageDock } from "./stage-dock";
import { StageFrame } from "./stage-frame";
import type { StagePage } from "./stage-slide";
import styles from "./stage.module.css";
import { useStageKeys } from "./use-stage-keys";
import { toggleFullscreen } from "./use-stage-mode";

// 总结页的放映舞台：左边是结论，右边是知识结构和下一步；讲到哪条结论哪条高亮。点「完成课程」后换成学习报告
export function StageSummaryScene({ scene, lesson, page }: { scene: Extract<LessonScene, { kind: "summary" }>; lesson: Lesson; page: StagePage }) {
  const content = scene.content!;
  const narration = useSceneNarration(content.narration);
  const { finish } = useFinishLesson(lesson, scene.id);
  const root = useRef<HTMLElement>(null);
  useFitScene(root, scene.id);
  useStageKeys({ play: () => (narration.playing ? narration.pause() : narration.play()), fullscreen: toggleFullscreen });
  const started = narration.index >= 0;
  const active = narration.activePoint;

  return (
    <>
      <StageFrame>
        <section ref={root} className={styles.scene} aria-label={`第 ${page.index + 1} 页`}>
          <div className={styles.head}>
            <span className={styles.tag}>总结</span>
            <h2 id="scene-title" tabIndex={-1} className={styles.title}>
              <RichText text={scene.title} />
            </h2>
          </div>
          <div className={styles.sumcols} data-fit="sumcols">
            <ol className={styles.recap}>
              {content.recap.map((item, index) => (
                <li key={index} data-active={started && active === index} data-dim={started && active >= 0 && active !== index}>
                  <span className={styles.recapNo} aria-hidden>
                    {index + 1}
                  </span>
                  <span>
                    <RichText text={item} />
                  </span>
                </li>
              ))}
            </ol>
            <div className={styles.sumright}>
              <ul className={styles.map} aria-label="知识结构">
                {content.map.map((node, index) => (
                  <li key={index} className={styles.node}>
                    <p className={styles.nodeLabel}>
                      <RichText text={node.label} />
                    </p>
                    {node.children.length > 0 && (
                      <ul className={styles.chips}>
                        {node.children.map((child, childIndex) => (
                          <li key={childIndex} className={styles.chip}>
                            <RichText text={child} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <div className={styles.next}>
                <strong className={styles.nextTitle}>下一步</strong>
                <ul>
                  {content.nextSteps.map((step, index) => (
                    <li key={index}>
                      <RichText text={step} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <BasisLine grounding={lesson.grounding} sourceCount={lesson.sources.length} />
        </section>
      </StageFrame>
      <StageDock narration={narration} playLabel="播放总结" showAutoAdvance={false} {...page} primary={{ label: "完成课程", onClick: finish }} />
    </>
  );
}
