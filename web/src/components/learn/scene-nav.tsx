"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { stripMath } from "@/lib/learn/math/rich";
import type { LessonScene } from "@/lib/learn/schema";
import styles from "./learn.module.css";
import { KIND_ICON, KIND_LABEL } from "./scene-meta";

// 页面导航：一排小标签，可以跳到任意一页；没生成好的页显示进度，学完的页打勾
export function SceneNav({
  scenes,
  current,
  completed,
  onSelect,
}: {
  scenes: LessonScene[];
  current: number;
  completed: string[];
  onSelect: (index: number) => void;
}) {
  const active = useRef<HTMLButtonElement>(null);

  // 切页后把当前标签滚到中间
  useEffect(() => {
    active.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [current]);

  return (
    <nav aria-label="课程页面" className={`${styles.nav} shrink-0 border-b border-border/40`}>
      {scenes.map((scene, index) => {
        const Icon = KIND_ICON[scene.kind];
        const done = completed.includes(scene.id);
        const status = done ? "已学完" : scene.status === "ready" ? "" : scene.status === "failed" ? "没生成成功" : "正在编写";
        return (
          <button
            key={scene.id}
            ref={index === current ? active : undefined}
            type="button"
            className={styles.navItem}
            data-state={scene.status}
            aria-current={index === current ? "step" : undefined}
            aria-label={`第 ${index + 1} 页，${KIND_LABEL[scene.kind]}：${stripMath(scene.title)}${status ? `，${status}` : ""}`}
            onClick={() => onSelect(index)}
          >
            {scene.status === "generating" || scene.status === "pending" ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            ) : scene.status === "failed" ? (
              <CircleAlert className="size-3.5 text-destructive" aria-hidden />
            ) : done ? (
              <Check className="size-3.5 text-success" aria-hidden />
            ) : (
              <Icon className="size-3.5" aria-hidden />
            )}
            {index + 1} {KIND_LABEL[scene.kind]}
          </button>
        );
      })}
    </nav>
  );
}
