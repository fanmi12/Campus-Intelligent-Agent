"use client";

import { Lightbulb } from "lucide-react";
import { useEffect } from "react";
import type { Lesson, LessonScene, SlideContent } from "@/lib/learn/schema";
import styles from "../learn.module.css";
import { NarrationBar } from "../narration-bar";
import { BasisLine, RichText, SourceBadges } from "../source-badges";
import { usePrefs } from "../learn-storage";
import { useNarration } from "../use-narration";
import { SceneHeader } from "./scene-header";

export function SlideTable({ table }: { table: NonNullable<SlideContent["table"]> }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.columns.map((column, index) => (
              <th key={index} scope="col">
                {column}
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

export function SlideScene({ scene, lesson }: { scene: Extract<LessonScene, { kind: "slide" }>; lesson: Lesson }) {
  const content = scene.content!;
  const prefs = usePrefs();
  const narration = useNarration(content.narration, { rate: prefs.rate });
  const started = narration.index >= 0;
  const active = narration.activePoint;

  // 播放时让当前要点滚动到可见位置（字幕条贴在底部，CSS 里留了余量）
  useEffect(() => {
    if (narration.playing && active >= 0) {
      document.getElementById(`point-${scene.id}-${active}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [narration.playing, active, scene.id]);

  const table = content.table ? <SlideTable table={content.table} /> : null;
  return (
    <>
      <div className="flex flex-1 flex-col gap-4">
        <SceneHeader kind="slide" title={scene.title} />
        <p className={styles.lead}>
          <RichText text={content.lead} />
        </p>
        {content.layout === "compare" && table}
        <ol className={styles.points}>
          {content.points.map((point, index) => (
            <li
              key={index}
              id={`point-${scene.id}-${index}`}
              className={styles.point}
              data-active={started && active === index}
              data-dim={started && active >= 0 && active !== index}
              aria-current={started && active === index ? "true" : undefined}
            >
              <span className={styles.pointIndex} aria-hidden>
                {content.layout === "steps" ? index + 1 : "•"}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className={styles.pointHeading}>
                  {point.heading}
                  <SourceBadges numbers={point.sourceNumbers} />
                </h3>
                <p className={styles.pointBody}>
                  <RichText text={point.body} />
                </p>
              </div>
            </li>
          ))}
        </ol>
        {content.layout !== "compare" && table}
        {content.example && (
          <aside className={styles.example}>
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <strong>{content.example.title}</strong>
              <p>
                <RichText text={content.example.body} />
              </p>
            </div>
          </aside>
        )}
        <BasisLine grounding={lesson.grounding} sourceCount={lesson.sources.length} />
      </div>
      <NarrationBar narration={narration} />
    </>
  );
}
