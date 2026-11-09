"use client";

import type { Figure } from "@/lib/learn/figure";
import { BarsFigureView, CellsFigureView, RingFigureView, ShapesFigureView, TreeFigureView } from "./diagrams";
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

export function FigureList({ figures }: { figures: Figure[] }) {
  return (
    <>
      {figures.map((figure, index) => (
        <FigureView key={index} figure={figure} />
      ))}
    </>
  );
}
