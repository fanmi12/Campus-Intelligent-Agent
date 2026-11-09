"use client";

import { ChevronLeft, ChevronRight, CircleAlert, FlaskConical, LoaderCircle, MessageCircleQuestion, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getClientId } from "@/components/chat/storage";
import { Button, buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/config";
import type { Lesson, LessonScene } from "@/lib/learn/schema";
import { AskTeacher } from "./ask-teacher";
import { GeneratingState } from "./generating-state";
import { sendLearnEvent } from "./learn-events";
import { LearnHeader } from "./learn-header";
import { updateProgress, useProgress } from "./learn-storage";
import styles from "./learn.module.css";
import { LessonMenu } from "./lesson-menu";
import { SceneNav } from "./scene-nav";
import { DiscussionScene } from "./scenes/discussion-scene";
import { FlashcardsScene } from "./scenes/flashcards-scene";
import { QuizScene } from "./scenes/quiz-scene";
import { SlideScene } from "./scenes/slide-scene";
import { SummaryScene } from "./scenes/summary-scene";
import { SourceProvider } from "./source-badges";
import { KIND_LABEL } from "./scene-meta";
import { useLesson } from "./use-lesson";

// 一页的实际内容（页面已生成好才会渲染）
export function SceneView({ scene, lesson, hasNext, onNext }: { scene: LessonScene; lesson: Lesson; hasNext: boolean; onNext: () => void }) {
  switch (scene.kind) {
    case "slide":
      return <SlideScene scene={scene} lesson={lesson} hasNext={hasNext} onNext={onNext} />;
    case "quiz":
      return <QuizScene scene={scene} lesson={lesson} hasNext={hasNext} onNext={onNext} />;
    case "flashcards":
      return <FlashcardsScene scene={scene} lesson={lesson} />;
    case "discussion":
      return <DiscussionScene scene={scene} lesson={lesson} />;
    case "summary":
      return <SummaryScene scene={scene} lesson={lesson} />;
  }
}

// 还没生成好或生成失败的页：显示大纲里的标题和要点，失败的可以重新生成
export function ScenePlaceholder({ scene, index, total, owner, retrying, onRetry }: { scene: LessonScene; index: number; total: number; owner: boolean; retrying: boolean; onRetry: () => void }) {
  const failed = scene.status === "failed";
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className={styles.eyebrow}>{KIND_LABEL[scene.kind]}</span>
        <h2 id="scene-title" tabIndex={-1} className={styles.sceneTitle}>
          {scene.title}
        </h2>
      </header>
      <div className={styles.panel}>
        <p className="flex items-center gap-2 text-[15px] font-medium" role="status">
          {failed ? (
            <>
              <CircleAlert className="size-4 text-destructive" />
              {scene.error ?? "这一页没生成成功"}
            </>
          ) : (
            <>
              <LoaderCircle className="size-4 animate-spin text-primary" />
              正在编写第 {index + 1}/{total} 页…
            </>
          )}
        </p>
        {scene.keyPoints.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px] leading-7 text-muted-foreground">
            {scene.keyPoints.map((point, pointIndex) => (
              <li key={pointIndex}>{point}</li>
            ))}
          </ul>
        )}
        {failed && (
          <div className="mt-4">
            {owner ? (
              <Button onClick={onRetry} disabled={retrying}>
                <RefreshCw className={retrying ? "animate-spin" : ""} />
                重新生成
              </Button>
            ) : (
              <p className={styles.muted}>请让创建这节课的同学点「重新生成」。</p>
            )}
          </div>
        )}
      </div>
      {!failed && (
        <div className="flex flex-col gap-3" aria-hidden>
          <div className={`${styles.skeleton} h-20`} />
          <div className={`${styles.skeleton} h-20`} />
          <div className={`${styles.skeleton} h-20`} />
        </div>
      )}
    </div>
  );
}

function FailedState({ lesson, owner, retrying, onRetry }: { lesson: Lesson; owner: boolean; retrying: boolean; onRetry: () => void }) {
  return (
    <section className={`${styles.panel} mt-6 flex flex-col items-center gap-4 py-8 text-center`}>
      <CircleAlert className="size-10 text-destructive" />
      <div>
        <h2 className="text-lg font-semibold">备课没有成功</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground" role="alert">
          {lesson.error ?? "备课失败了，请稍后再试"}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        {owner && (
          <Button size="lg" onClick={onRetry} disabled={retrying}>
            <RefreshCw className={retrying ? "animate-spin" : ""} />
            重新生成
          </Button>
        )}
        <Link href="/learn" className={buttonVariants({ variant: "outline", size: "lg" })}>
          换个主题试试
        </Link>
      </div>
    </section>
  );
}

// 键盘左右键翻页：焦点在输入框里时不响应
function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)));
}

export function Classroom({ initialLesson }: { initialLesson: Lesson }) {
  const { lesson, owner, queuePosition, offline, missing, restart, patch } = useLesson(initialLesson);
  const progress = useProgress(lesson.id);
  const [retrying, setRetrying] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const shownScene = useRef<number | null>(null);

  const scenes = lesson.scenes;
  const current = Math.min(progress.scene, Math.max(0, scenes.length - 1));
  const scene = scenes[current];

  const goTo = useCallback(
    (index: number) => {
      const target = Math.min(Math.max(0, index), scenes.length - 1);
      updateProgress(lesson.id, (value) => {
        // 往后翻就算离开的这一页学完了
        const completed = target > value.scene && scenes[value.scene] && !value.completed.includes(scenes[value.scene].id) ? [...value.completed, scenes[value.scene].id] : value.completed;
        return { ...value, scene: target, completed };
      });
    },
    [lesson.id, scenes],
  );

  // 课程名在备课完成后才确定，浏览器标签页上的标题跟着更新
  useEffect(() => {
    document.title = `${lesson.title} · ${site.name}`;
  }, [lesson.title]);

  // 进入课堂记一次浏览；每看一页记一次（匿名统计）
  useEffect(() => {
    if (!lesson.demo) sendLearnEvent({ lessonId: lesson.id, type: "view" }, { once: true });
  }, [lesson.id, lesson.demo]);
  const sceneId = scene?.id;
  useEffect(() => {
    if (sceneId && !lesson.demo) sendLearnEvent({ lessonId: lesson.id, type: "scene", sceneId }, { once: true });
  }, [lesson.id, lesson.demo, sceneId]);

  // 切页后回到顶部，并把焦点移到页标题（首次进入不抢焦点）
  useEffect(() => {
    const previous = shownScene.current;
    shownScene.current = current;
    if (previous === null || previous === current) return;
    main.current?.scrollTo({ top: 0 });
    document.getElementById("scene-title")?.focus({ preventScroll: true });
  }, [current]);

  // 键盘左右键翻页
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      if (event.key === "ArrowRight") goTo(current + 1);
      if (event.key === "ArrowLeft") goTo(current - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, goTo]);

  // 学习用时：页面可见、最近 2 分钟内有操作才计时，学完之后不再计
  const lastTouch = useRef(0);
  const finished = progress.finishedAt !== undefined;
  useEffect(() => {
    if (finished || lesson.status === "generating") return;
    lastTouch.current = Date.now();
    const touch = () => {
      lastTouch.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true, capture: true }));
    const timer = setInterval(() => {
      if (document.hidden || Date.now() - lastTouch.current > 120_000) return;
      updateProgress(lesson.id, (value) => ({ ...value, activeMs: value.activeMs + 5000 }));
    }, 5000);
    return () => {
      clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, touch, { capture: true }));
    };
  }, [lesson.id, lesson.status, finished]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      const response = await fetch(`/api/learn/lessons/${lesson.id}/retry`, { method: "POST", headers: { "X-Client-Id": getClientId() } });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "暂时没法重新生成，请稍后再试");
        return;
      }
      // 马上显示「备课中」，不用等下一次轮询
      patch({
        lesson: {
          ...lesson,
          status: "generating",
          step: lesson.scenes.length ? "writing" : "queued",
          error: undefined,
          scenes: lesson.scenes.map((item) => (item.status === "ready" ? item : { ...item, status: "pending" as const, error: undefined })),
        },
      });
      restart();
    } catch {
      toast.error("网络好像断了，检查一下网络再试");
    } finally {
      setRetrying(false);
    }
  }

  const hasFailed = lesson.status === "failed" || scenes.some((item) => item.status === "failed");
  const generating = lesson.status === "generating";

  let body: React.ReactNode;
  if (missing) {
    body = (
      <section className={`${styles.panel} mt-6 flex flex-col items-center gap-4 py-8 text-center`}>
        <h2 className="text-lg font-semibold">这节课已经被删除了</h2>
        <Link href="/learn" className={buttonVariants({ size: "lg" })}>
          回到小狮课堂
        </Link>
      </section>
    );
  } else if (!scene) {
    body = lesson.status === "failed" ? <FailedState lesson={lesson} owner={owner} retrying={retrying} onRetry={retry} /> : <GeneratingState lesson={lesson} queuePosition={queuePosition} />;
  } else if (scene.status === "ready" && scene.content) {
    body = <SceneView key={scene.id} scene={scene} lesson={lesson} hasNext={current + 1 < scenes.length} onNext={() => goTo(current + 1)} />;
  } else {
    body = <ScenePlaceholder key={scene.id} scene={scene} index={current} total={scenes.length} owner={owner} retrying={retrying || generating} onRetry={retry} />;
  }

  return (
    <SourceProvider sources={lesson.sources}>
      <div className="flex h-dvh flex-col bg-aurora">
        <LearnHeader
          title={lesson.title}
          subtitle={scenes.length ? `第 ${current + 1}/${scenes.length} 页 · 约 ${lesson.minutes} 分钟` : "小狮课堂"}
          backHref="/learn"
          backLabel="返回小狮课堂"
        >
          <Button variant="ghost" size="icon" aria-label="问狮老师" title="问狮老师" disabled={!scene || scene.status !== "ready"} onClick={() => setAskOpen(true)}>
            <MessageCircleQuestion />
          </Button>
          <LessonMenu lesson={lesson} owner={owner} canRetry={hasFailed && !generating} onRetry={retry} />
        </LearnHeader>

        {lesson.demo && (
          <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pt-2">
            <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5 text-foreground/80">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning" />
              演示模式：还没接入大模型，这里展示的是示例课程
            </div>
          </div>
        )}
        {offline && !missing && (
          <p role="status" className="shrink-0 bg-warning/10 px-4 py-1.5 text-center text-xs text-foreground/80">
            网络不太稳定，正在重试…
          </p>
        )}

        {scenes.length > 0 && !missing && <SceneNav scenes={scenes} current={current} completed={progress.completed} onSelect={goTo} />}

        <main ref={main} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pt-4 pb-4">{body}</div>
        </main>

        {scenes.length > 0 && !missing && (
          <footer className="shrink-0 border-t border-border/60 bg-background/90 backdrop-blur-md">
            <div className="pb-safe mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pt-2.5">
              <Button variant="outline" onClick={() => goTo(current - 1)} disabled={current === 0}>
                <ChevronLeft />
                上一页
              </Button>
              <p className="flex-1 text-center text-sm text-muted-foreground" aria-live="polite">
                {current + 1} / {scenes.length}
              </p>
              <Button onClick={() => goTo(current + 1)} disabled={current + 1 >= scenes.length}>
                下一页
                <ChevronRight />
              </Button>
            </div>
          </footer>
        )}
        {/* 提问记录要跨页保留，所以抽屉一直挂着，只是按页面切换提问的上下文 */}
        {scene && !missing && <AskTeacher lesson={lesson} scene={scene} open={askOpen} onOpenChange={setAskOpen} />}
      </div>
    </SourceProvider>
  );
}
