"use client";

import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { SceneView } from "../scene-view";
import { useFinishLesson } from "../use-finish-lesson";
import { StageDock } from "./stage-dock";
import { StageSlideScene, type StagePage } from "./stage-slide";
import { StageSummaryScene } from "./stage-summary";
import styles from "./stage.module.css";
import { useStageKeys } from "./use-stage-keys";
import { toggleFullscreen } from "./use-stage-mode";

// 测验、闪卡、讨论这类要操作的页面：沿用手机上的单列页面，放大一点，下面接同一条控制条
function StageGenericScene({ scene, lesson, page }: { scene: LessonScene; lesson: Lesson; page: StagePage }) {
  useStageKeys({ fullscreen: toggleFullscreen });
  return (
    <>
      <div className={styles.generic}>
        <div className={styles.genericInner}>
          <SceneView scene={scene} lesson={lesson} hasNext={page.hasNext} onNext={page.onNext} />
        </div>
      </div>
      <StageDock {...page} />
    </>
  );
}

// 放映模式下的一页：讲解页和总结页是 16:9 的舞台，其余页面是放大的单列页面；总结页完成课程后换成学习报告
export function StageScene({ scene, lesson, page }: { scene: LessonScene; lesson: Lesson; page: StagePage }) {
  const { finished } = useFinishLesson(lesson, scene.id);
  if (scene.kind === "slide") return <StageSlideScene scene={scene} lesson={lesson} page={page} />;
  if (scene.kind === "summary" && !finished) return <StageSummaryScene scene={scene} lesson={lesson} page={page} />;
  return <StageGenericScene scene={scene} lesson={lesson} page={page} />;
}
