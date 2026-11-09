"use client";

import type { Figure } from "@/lib/learn/figure";
import { BarsFigureView, CellsFigureView, RingFigureView, ShapesFigureView, TreeFigureView } from "./diagrams";
import styles from "./figure.module.css";
import { MatmulFigureView } from "./matmul";
import { PanelsFigureView, PlotFigureView } from "./plot";

// 讲解页里的一张图：按 t 选择画法。规格是纯数据（见 lib/learn/figure.ts），这里只负责画
export function FigureView({ figure }: { figure: Figure }) {
  switch (figure.t) {
    case "plot":
      return <PlotFigureView figure={figure} />;
    case "panels":
      return <PanelsFigureView figure={figure} />;
    case "cells":
      return <CellsFigureView figure={figure} />;
    case "ring":
      return <RingFigureView figure={figure} />;
    case "tree":
      return <TreeFigureView figure={figure} />;
    case "bars":
      return <BarsFigureView figure={figure} />;
    case "shapes":
      return <ShapesFigureView figure={figure} />;
    case "matmul":
      return <MatmulFigureView figure={figure} />;
  }
}

// 一页的所有图：
// - stack：上下排开，高度由内容决定（手机上的课堂页）
// - fill：占满父容器剩余的高度，图按剩余高度缩放，不把容器撑出滚动条（放映模式的右栏）
// - wide：同 fill，并且并排的小图排成一行、放大（放映模式里整行宽的多图对比页）
export function FigureList({ figures, mode = "stack" }: { figures: Figure[]; mode?: "stack" | "fill" | "wide" }) {
  return (
    <div className={`${styles.list} ${mode === "fill" ? styles.fill : mode === "wide" ? `${styles.fill} ${styles.wide}` : ""}`}>
      {figures.map((figure, index) => (
        <FigureView key={index} figure={figure} />
      ))}
    </div>
  );
}

// 这一页有没有「并排对比」的图：放映模式里用整行宽来放它们
export const hasPanels = (figures: Figure[] | undefined) => Boolean(figures?.some((figure) => figure.t === "panels"));
