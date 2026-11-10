"use client";

import { useLayoutEffect, type RefObject } from "react";

// 舞台是固定的 1280×720：内容放不下时，逐步缩小这一页的字号（从 22px 到 13.5px），
// 直到被标了 data-fit 的区域（要点列、右栏、总结页）都不再出现滚动条。
// 右栏有两个标签页（图像 / 例题与表格）时两个都要放得下，字号才不会随标签跳动。
const MAX_SIZE = 22;
const MIN_SIZE = 13.5;

function overflowing(root: HTMLElement): boolean {
  return [...root.querySelectorAll<HTMLElement>("[data-fit]")].some((element) => element.scrollHeight - element.clientHeight > 1);
}

export function fitScene(root: HTMLElement) {
  root.style.fontSize = "";
  const side = root.querySelector<HTMLElement>("[data-side]");
  const tabs: (string | undefined)[] = side && root.querySelector("[data-tabs]") ? ["fig", "ex"] : [undefined];
  const original = side?.dataset.tab;
  let size = MAX_SIZE;
  for (; size > MIN_SIZE; size -= 0.5) {
    root.style.fontSize = `${size}px`;
    let tooBig = false;
    for (const tab of tabs) {
      if (tab && side) side.dataset.tab = tab;
      if (overflowing(root)) {
        tooBig = true;
        break;
      }
    }
    if (!tooBig) break;
  }
  if (side && original) side.dataset.tab = original;
  root.style.fontSize = size < MAX_SIZE ? `${Math.max(size, MIN_SIZE)}px` : "";
}

// key 变了（换了一页、内容变了）就重新量一次；字体加载完成后字形变了，也再量一次
export function useFitScene(ref: RefObject<HTMLElement | null>, key: string) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    fitScene(root);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) fitScene(root);
    });
    return () => {
      cancelled = true;
    };
  }, [ref, key]);
}
