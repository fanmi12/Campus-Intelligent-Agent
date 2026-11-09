"use client";

import { useSyncExternalStore } from "react";
import { emptyProgress, type CardMark, type DiscussionTurn, type LessonProgress, type AnswerRecord } from "@/lib/learn/progress";
import type { LessonStatus } from "@/lib/learn/schema";

// 小狮课堂的本地存储：课程索引、学习进度、偏好（复习卡在 Phase 3 加入）。
// 全部 try/catch 包裹：隐私模式、存储写满时读写会失败，页面不能因此崩，失败时退回本次访问的内存。
// 用 useSyncExternalStore 读取：服务端和首次渲染拿到默认值，挂载后再换成本地数据，不会出现水合不一致。

const LESSONS_KEY = "campus-agent:learn:lessons:v1";
const PROGRESS_KEY = (id: string) => `campus-agent:learn:progress:v1:${id}`;
const PREFS_KEY = "campus-agent:learn:prefs:v1";
const MAX_LESSONS = 50;

// ---------- 底层：带缓存的 JSON 读写 + 订阅 ----------
const memory = new Map<string, string>();
const parsed = new Map<string, { raw: string | null; value: unknown }>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string) {
  try {
    localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    memory.set(key, raw);
  }
  listeners.forEach((listener) => listener());
}

function removeRaw(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 隐私模式下读写都会失败，忽略
  }
  memory.delete(key);
  listeners.forEach((listener) => listener());
}

// raw 没变就返回同一个对象：useSyncExternalStore 要求没有变化时快照引用稳定
function readJson<T>(key: string, parse: (value: unknown) => T): T {
  const raw = readRaw(key);
  const hit = parsed.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T;
  try {
    value = parse(raw ? JSON.parse(raw) : null);
  } catch {
    value = parse(null);
  }
  parsed.set(key, { raw, value });
  return value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 别的标签页改了存储
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith("campus-agent:learn:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// ---------- 我的课程 ----------
export type LocalLesson = {
  id: string;
  title: string;
  topic: string;
  createdAt: number;
  status: LessonStatus;
  done: number;
  total: number;
  completedAt?: number;
  score?: number;
  // 服务器上已删除或找不到：列表里标灰，可以移除
  gone?: boolean;
};

const NO_LESSONS: LocalLesson[] = [];

function parseLessons(value: unknown): LocalLesson[] {
  if (!Array.isArray(value)) return NO_LESSONS;
  return value.filter(
    (item): item is LocalLesson => isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.createdAt === "number",
  );
}

export const readLocalLessons = () => readJson(LESSONS_KEY, parseLessons);

export function useLocalLessons(): LocalLesson[] {
  return useSyncExternalStore(subscribe, readLocalLessons, () => NO_LESSONS);
}

// 新建或更新一节课的记录（新的排在最前面）
export function upsertLocalLesson(item: Partial<LocalLesson> & Pick<LocalLesson, "id">) {
  const all = readLocalLessons();
  const existing = all.find((lesson) => lesson.id === item.id);
  const merged: LocalLesson = {
    title: "新课程",
    topic: "",
    createdAt: Date.now(),
    status: "generating",
    done: 0,
    total: 0,
    ...existing,
    ...item,
  };
  if (existing && JSON.stringify(existing) === JSON.stringify(merged)) return;
  const next = existing ? all.map((lesson) => (lesson.id === item.id ? merged : lesson)) : [merged, ...all];
  writeRaw(LESSONS_KEY, JSON.stringify(next.slice(0, MAX_LESSONS)));
}

export function removeLocalLesson(id: string) {
  writeRaw(LESSONS_KEY, JSON.stringify(readLocalLessons().filter((lesson) => lesson.id !== id)));
  removeRaw(PROGRESS_KEY(id));
}

// ---------- 学习进度 ----------
const defaultProgress = emptyProgress();

function parseProgress(value: unknown): LessonProgress {
  if (!isRecord(value)) return defaultProgress;
  const record = (field: unknown) => (isRecord(field) ? field : {});
  return {
    scene: typeof value.scene === "number" && value.scene >= 0 ? Math.floor(value.scene) : 0,
    completed: Array.isArray(value.completed) ? value.completed.filter((id): id is string => typeof id === "string") : [],
    answers: record(value.answers) as Record<string, AnswerRecord>,
    cards: record(value.cards) as Record<string, CardMark>,
    discussion: record(value.discussion) as Record<string, DiscussionTurn[]>,
    startedAt: typeof value.startedAt === "number" ? value.startedAt : 0,
    activeMs: typeof value.activeMs === "number" ? value.activeMs : 0,
    finishedAt: typeof value.finishedAt === "number" ? value.finishedAt : undefined,
    score: typeof value.score === "number" ? value.score : undefined,
  };
}

export const readProgress = (id: string) => readJson(PROGRESS_KEY(id), parseProgress);

export function useProgress(id: string): LessonProgress {
  return useSyncExternalStore(
    subscribe,
    () => readProgress(id),
    () => defaultProgress,
  );
}

export function updateProgress(id: string, change: (progress: LessonProgress) => LessonProgress) {
  const current = readProgress(id);
  const next = change(current.startedAt ? current : { ...current, startedAt: Date.now() });
  if (next !== current) writeRaw(PROGRESS_KEY(id), JSON.stringify(next));
}

export const resetProgress = (id: string) => removeRaw(PROGRESS_KEY(id));

// ---------- 偏好 ----------
export type Prefs = { rate: 0.9 | 1 | 1.2; voice: "auto" | "captions"; autoAdvance: boolean };
const defaultPrefs: Prefs = { rate: 1, voice: "auto", autoAdvance: false };

function parsePrefs(value: unknown): Prefs {
  if (!isRecord(value)) return defaultPrefs;
  const rate = value.rate === 0.9 || value.rate === 1.2 ? value.rate : 1;
  const voice = value.voice === "captions" ? "captions" : "auto";
  const autoAdvance = value.autoAdvance === true;
  if (rate === 1 && voice === "auto" && !autoAdvance) return defaultPrefs;
  return { rate, voice, autoAdvance };
}

export const readPrefs = () => readJson(PREFS_KEY, parsePrefs);

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, readPrefs, () => defaultPrefs);
}

export function updatePrefs(patch: Partial<Prefs>) {
  writeRaw(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
}
