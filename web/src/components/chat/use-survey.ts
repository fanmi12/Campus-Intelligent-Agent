"use client";

import { useCallback, useState } from "react";

// 体验问卷的状态。"已提交""不再提示"存在本机，换浏览器或清除数据后会重新出现；
// 问卷 iframe 第一次打开时才挂载，之后整页都保留，收起再打开还能接着填。
const KEY = "campus-agent:survey:v1";

type Saved = { submittedAt?: string; dismissedAt?: string };

function read(): Saved {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return value && typeof value === "object" ? (value as Saved) : {};
  } catch {
    return {};
  }
}

function write(value: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // 无痕模式等写不进去时，只在这次打开期间生效
  }
}

export function useSurvey() {
  // 聊天界面只在浏览器端渲染（见 chat.tsx），可以直接读 localStorage
  const [saved, setSaved] = useState<Saved>(read);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const submitted = Boolean(saved.submittedAt);

  const save = useCallback((patch: Saved) => {
    const next = { ...read(), ...patch };
    write(next);
    setSaved(next);
  }, []);

  // 已经提交过的人再打开时先看到"已提交"，点"再填一份"才加载问卷，避免误交重复答卷
  const openSurvey = useCallback(() => {
    setOpen(true);
    if (!submitted) setMounted(true);
  }, [submitted]);
  const startSurvey = useCallback(() => setMounted(true), []);
  const dismiss = useCallback(() => save({ dismissedAt: new Date().toISOString() }), [save]);
  const markSubmitted = useCallback(() => save({ submittedAt: new Date().toISOString() }), [save]);

  return {
    open,
    setOpen,
    mounted,
    submitted,
    dismissed: Boolean(saved.dismissedAt),
    openSurvey,
    startSurvey,
    dismiss,
    markSubmitted,
  };
}

export type Survey = ReturnType<typeof useSurvey>;
