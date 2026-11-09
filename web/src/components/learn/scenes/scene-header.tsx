import type { SceneKind } from "@/lib/learn/schema";
import styles from "../learn.module.css";
import { KIND_ICON, KIND_LABEL } from "../scene-meta";

// 每一页顶部的「类型 · 标题」。标题可以接收焦点：切页后课堂页会把焦点移到这里，读屏软件和键盘用户从标题开始读
export function SceneHeader({ kind, title }: { kind: SceneKind; title: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <header className="flex flex-col gap-1.5">
      <span className={styles.eyebrow}>
        <Icon className="size-4" />
        {KIND_LABEL[kind]}
      </span>
      <h2 id="scene-title" tabIndex={-1} className={styles.sceneTitle}>
        {title}
      </h2>
    </header>
  );
}
