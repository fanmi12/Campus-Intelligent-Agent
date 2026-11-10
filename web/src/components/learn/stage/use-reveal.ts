"use client";

import { useState } from "react";
import type { Narration } from "../use-narration";

// 要点逐条出现：手动（点击舞台、空格）一次出现一条；播放讲解时讲到第 i 个要点，前 i+1 条都要出现；讲完全部出现。
// 出现过的不会再收回（用户回放前面的句子也不会让后面的要点消失）。
export function useReveal(total: number, narration: Narration) {
  const [revealed, setRevealed] = useState(0);
  const [seen, setSeen] = useState("");
  // 讲解推进了就在渲染期间调整状态（React 推荐的写法，不用 effect）
  const key = `${narration.index}:${narration.ended}`;
  if (seen !== key) {
    setSeen(key);
    const target = narration.ended ? total : narration.index >= 0 ? narration.activePoint + 1 : 0;
    if (target > revealed) setRevealed(Math.min(total, target));
  }
  return {
    revealed,
    revealNext: () => setRevealed((value) => Math.min(total, value + 1)),
  };
}
