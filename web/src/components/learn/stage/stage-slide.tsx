"use client";

import { ChartLine, Lightbulb } from "lucide-react";
import { useRef, useState } from "react";
import type { Lesson, LessonScene, SlideContent } from "@/lib/learn/schema";
import { FigureList, hasPanels } from "../figure";
import { BasisLine, RichText, SourceBadges } from "../source-badges";
import { useSceneNarration } from "../use-scene-narration";
import { useFitScene } from "./fit";
import { StageDock } from "./stage-dock";
import { StageFrame } from "./stage-frame";
import styles from "./stage.module.css";
import { useReveal } from "./use-reveal";
import { useStageKeys } from "./use-stage-keys";
import { toggleFullscreen } from "./use-stage-mode";

export type StagePage = { index: number; total: number; hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void };

function StageTable({ table }: { table: SlideContent["table"] }) {
  if (!table) return null;
  return (
    <div className={styles.tbl}>
      <table>
        <thead>
          <tr>
            {table.columns.map((column, index) => (
              <th key={index} scope="col">
                <RichText text={column} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>
                  <RichText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 讲解页的放映舞台：左边要点逐条出现，右边是图像和「例题与表格」，讲到哪条哪条高亮；有并排对比图的页面，图占满整行
export function StageSlideScene({ scene, lesson, page }: { scene: Extract<LessonScene, { kind: "slide" }>; lesson: Lesson; page: StagePage }) {
  const content = scene.content!;
  const narration = useSceneNarration(content.narration, { hasNext: page.hasNext, onNext: page.onNext });
  const points = content.points;
  const count = points.length;
  const { revealed, revealNext } = useReveal(count, narration);
  const figures = content.figures ?? [];
  const hasFigures = figures.length > 0;
  const wide = hasPanels(figures);
  const hasExtra = Boolean(content.example || content.table);
  const [tab, setTab] = useState<"fig" | "ex">(hasFigures ? "fig" : "ex");
  const root = useRef<HTMLElement>(null);
  useFitScene(root, `${scene.id}:${wide}`);

  const allShown = revealed >= count;
  const advance = () => {
    if (!allShown) revealNext();
    else if (page.hasNext) page.onNext();
  };
  useStageKeys({ advance, play: () => (narration.playing ? narration.pause() : narration.play()), fullscreen: toggleFullscreen });

  const started = narration.index >= 0;
  const active = narration.activePoint;
  const tip = !allShown ? `空格 / 点击舞台：显示下一条要点（${revealed}/${count}）` : page.hasNext ? "要点已全部显示 · 空格翻到下一页" : "要点已全部显示";

  return (
    <>
      <StageFrame onAdvance={advance} tip={tip}>
        <section ref={root} className={styles.scene} aria-label={`第 ${page.index + 1} 页`}>
          <div className={styles.head}>
            <span className={styles.tag}>讲解</span>
            <h2 id="scene-title" tabIndex={-1} className={styles.title}>
              <RichText text={scene.title} />
            </h2>
          </div>
          <p className={styles.lead}>
            <RichText text={content.lead} />
          </p>
          <div className={styles.cols} data-wide={wide}>
            <ol className={styles.points} data-fit={wide ? undefined : "points"}>
              {points.map((point, index) => (
                <li
                  key={index}
                  className={styles.point}
                  data-show={index < revealed}
                  data-active={started && active === index}
                  data-dim={started && active >= 0 && active !== index}
                  aria-current={started && active === index ? "true" : undefined}
                >
                  <span className={styles.pn} aria-hidden>
                    {content.layout === "steps" ? index + 1 : "•"}
                  </span>
                  <div className={styles.pointBody}>
                    <h3>
                      <RichText text={point.heading} />
                      <SourceBadges numbers={point.sourceNumbers} />
                    </h3>
                    <p>
                      <RichText text={point.body} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <aside className={styles.side} data-side data-fit="side" data-tab={tab} data-show={revealed >= Math.min(2, count)}>
              {hasFigures && hasExtra && (
                <div className={styles.tabs} role="tablist" aria-label="右栏内容" data-tabs>
                  <button type="button" role="tab" className={styles.tab} aria-selected={tab === "fig"} onClick={() => setTab("fig")}>
                    <ChartLine className="size-3.5" />
                    图像
                  </button>
                  <button type="button" role="tab" className={styles.tab} aria-selected={tab === "ex"} onClick={() => setTab("ex")}>
                    <Lightbulb className="size-3.5" />
                    例题与表格
                  </button>
                </div>
              )}
              <div className={`${styles.pane} ${styles.pfig}`}>{hasFigures && <FigureList figures={figures} mode={wide ? "wide" : "fill"} />}</div>
              <div className={`${styles.pane} ${styles.pex}`}>
                {content.example && (
                  <div className={styles.ex}>
                    <div className={styles.exh}>
                      <RichText text={content.example.title} />
                    </div>
                    <div className={styles.exb}>
                      <RichText text={content.example.body} />
                    </div>
                  </div>
                )}
                <StageTable table={content.table} />
              </div>
            </aside>
          </div>
          <BasisLine grounding={lesson.grounding} sourceCount={lesson.sources.length} />
        </section>
      </StageFrame>
      <StageDock narration={narration} {...page} />
    </>
  );
}
