import { randomBytes } from "node:crypto";
import { demoLesson } from "@/lib/learn/fixtures";
import {
  LESSON_VERSION,
  MAX_LESSON_JSON,
  type Grounding,
  type Lesson,
  type LessonSummary,
  type Level,
  type Minutes,
  type RequestedGrounding,
} from "@/lib/learn/schema";
import { getDb } from "../db";
import { isLessonRunning } from "./jobs";

// 小狮课堂的数据读写。课程整体存成 JSON（lessons.data），列里只放查询要用的字段。
// 资料原文（material）只给服务端生成用，不会出现在 getLesson() 的结果里。

// 生成中的课程超过这么久没有更新、并且当前进程里没有任务在跑，就判定为备课中断
export const STALE_MS = 3 * 60_000;
// 资料原文只留 7 天
export const MATERIAL_TTL_MS = 7 * 86_400_000;
// 「正在备课」的判断窗口：只看最近 10 分钟内创建的课
const ACTIVE_WINDOW_MS = 10 * 60_000;
export const INTERRUPTED_MESSAGE = "备课中断了（服务器可能重启过），请点「重新生成」";

type LessonRow = { id: string; data: string; updated_at: number };

export function newLessonId(): string {
  return randomBytes(9).toString("base64url");
}

// 内置课程：演示课程（demo- 开头）和精选课程（f- 开头，Phase 3 接入）不进数据库
function builtinLesson(id: string): Lesson | null {
  if (id === demoLesson.id) return demoLesson;
  return null;
}

export const isBuiltinLesson = (id: string) => builtinLesson(id) !== null;

export function createLessonRecord(input: {
  topic: string;
  level: Level;
  minutes: Minutes;
  // 用户选的依据；有资料或图片时一律是「你的资料」，auto 先记为通用知识，生成时再判定
  grounding: RequestedGrounding;
  clientId: string;
  material?: string;
  hasImages?: boolean;
}): Lesson {
  const now = Date.now();
  const grounding: Grounding = input.material || input.hasImages ? "material" : input.grounding === "campus" ? "campus" : "general";
  const lesson: Lesson = {
    id: newLessonId(),
    version: LESSON_VERSION,
    status: "generating",
    step: "queued",
    topic: input.topic,
    level: input.level,
    minutes: input.minutes,
    grounding,
    requestedGrounding: input.grounding,
    title: input.topic.slice(0, 30),
    summary: "",
    audience: "",
    objectives: [],
    scenes: [],
    sources: [],
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO lessons (id, client_id, status, title, topic, data, material, views, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(lesson.id, input.clientId, lesson.status, lesson.title, lesson.topic, JSON.stringify(lesson), input.material || null, now, now);
  return lesson;
}

// 读出一节课；生成中却长时间没有动静、本进程里也没有任务在跑的，改成失败并保存
function hydrate(row: LessonRow): Lesson {
  const lesson = JSON.parse(row.data) as Lesson;
  lesson.updatedAt = row.updated_at;
  if (lesson.status === "generating" && !isLessonRunning(lesson.id) && Date.now() - lesson.updatedAt >= STALE_MS) {
    lesson.status = "failed";
    lesson.error = INTERRUPTED_MESSAGE;
    // 写到一半的页面重新排队，重新生成时会补上
    lesson.scenes = lesson.scenes.map((scene) => (scene.status === "generating" ? { ...scene, status: "pending" as const } : scene));
    saveLesson(lesson);
  }
  return lesson;
}

export function getLesson(id: string): Lesson | null {
  const builtin = builtinLesson(id);
  if (builtin) return builtin;
  const row = getDb().prepare("SELECT id, data, updated_at FROM lessons WHERE id = ?").get(id) as LessonRow | undefined;
  return row ? hydrate(row) : null;
}

export function getLessonOwner(id: string): string | null {
  const row = getDb().prepare("SELECT client_id FROM lessons WHERE id = ?").get(id) as { client_id: string | null } | undefined;
  return row?.client_id ?? null;
}

export function getMaterial(id: string): string | null {
  const row = getDb().prepare("SELECT material FROM lessons WHERE id = ?").get(id) as { material: string | null } | undefined;
  return row?.material ?? null;
}

// 拍照资料转写成文字后存起来，重新生成时不用再识图
export function setMaterial(id: string, material: string): void {
  getDb().prepare("UPDATE lessons SET material = ? WHERE id = ?").run(material || null, id);
}

export function saveLesson(lesson: Lesson): void {
  lesson.updatedAt = Date.now();
  const data = JSON.stringify(lesson);
  if (Buffer.byteLength(data) > MAX_LESSON_JSON) throw new Error("课程内容过大，已放弃保存");
  getDb()
    .prepare("UPDATE lessons SET status = ?, title = ?, data = ?, updated_at = ? WHERE id = ?")
    .run(lesson.status, lesson.title, data, lesson.updatedAt, lesson.id);
}

export function deleteLesson(id: string): void {
  getDb().prepare("DELETE FROM lessons WHERE id = ?").run(id);
}

export function summarize(lesson: Lesson): LessonSummary {
  return {
    id: lesson.id,
    title: lesson.title,
    topic: lesson.topic,
    status: lesson.status,
    step: lesson.step,
    minutes: lesson.minutes,
    grounding: lesson.grounding,
    createdAt: lesson.createdAt,
    done: lesson.scenes.filter((scene) => scene.status === "ready").length,
    total: lesson.scenes.length,
  };
}

// 按传入顺序返回，不存在的跳过；最多 30 个
export function listSummaries(ids: string[]): LessonSummary[] {
  const wanted = [...new Set(ids)].slice(0, 30);
  const found = new Map<string, Lesson>();
  const stored: string[] = [];
  for (const id of wanted) {
    const builtin = builtinLesson(id);
    if (builtin) found.set(id, builtin);
    else stored.push(id);
  }
  if (stored.length) {
    const rows = getDb()
      .prepare(`SELECT id, data, updated_at FROM lessons WHERE id IN (${stored.map(() => "?").join(",")})`)
      .all(...stored) as LessonRow[];
    for (const row of rows) found.set(row.id, hydrate(row));
  }
  return wanted.flatMap((id) => {
    const lesson = found.get(id);
    return lesson ? [summarize(lesson)] : [];
  });
}

export function countRecentByClient(clientId: string, sinceMs: number): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM lessons WHERE client_id = ? AND created_at >= ?").get(clientId, sinceMs) as { n: number };
  return row.n;
}

// 这个浏览器是否有一节课正在备课：10 分钟内创建、仍在生成，并且还有动静（本进程在跑，或 3 分钟内更新过）
export function hasActiveLesson(clientId: string): boolean {
  const now = Date.now();
  const rows = getDb()
    .prepare("SELECT id, updated_at FROM lessons WHERE client_id = ? AND status = 'generating' AND created_at >= ?")
    .all(clientId, now - ACTIVE_WINDOW_MS) as { id: string; updated_at: number }[];
  return rows.some((row) => isLessonRunning(row.id) || now - row.updated_at < STALE_MS);
}

// 7 天前创建的课，资料原文清空；返回清理了几节
export function purgeExpiredMaterials(now = Date.now()): number {
  const result = getDb()
    .prepare("UPDATE lessons SET material = NULL WHERE material IS NOT NULL AND created_at < ?")
    .run(now - MATERIAL_TTL_MS);
  return Number(result.changes);
}

export function recordLessonEvent(event: { lessonId: string; clientId?: string; type: string; sceneId?: string; value?: number }): void {
  getDb()
    .prepare("INSERT INTO lesson_events (lesson_id, client_id, type, scene_id, value, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(event.lessonId, event.clientId ?? null, event.type, event.sceneId ?? null, event.value ?? null, Date.now());
}

export function incrementViews(id: string): void {
  getDb().prepare("UPDATE lessons SET views = views + 1 WHERE id = ?").run(id);
}

export type LearnStats = {
  generated: number;
  ready: number;
  failed: number;
  finished: number;
  avgScore: number | null;
  avgGenerateMs: number | null;
  recent: { id: string; title: string; topic: string; status: string; views: number; createdAt: number }[];
};

export function getLearnStats(sinceMs: number): LearnStats {
  const db = getDb();
  const get = <T>(sql: string, ...params: (string | number)[]) => db.prepare(sql).get(...params) as T;
  const count = (where: string) => get<{ n: number }>(`SELECT COUNT(*) AS n FROM lessons WHERE created_at >= ? ${where}`, sinceMs).n;
  const finish = get<{ n: number; avg: number | null }>(
    "SELECT COUNT(*) AS n, AVG(value) AS avg FROM lesson_events WHERE type = 'finish' AND created_at >= ?",
    sinceMs,
  );
  const generating = get<{ avg: number | null }>(
    "SELECT AVG(json_extract(data, '$.generatedMs')) AS avg FROM lessons WHERE status = 'ready' AND created_at >= ?",
    sinceMs,
  );
  const recent = db
    .prepare("SELECT id, title, topic, status, views, created_at FROM lessons ORDER BY created_at DESC LIMIT 30")
    .all() as { id: string; title: string; topic: string; status: string; views: number; created_at: number }[];
  return {
    generated: count(""),
    ready: count("AND status = 'ready'"),
    failed: count("AND status = 'failed'"),
    finished: finish.n,
    avgScore: finish.avg === null ? null : Math.round(finish.avg),
    avgGenerateMs: generating.avg === null ? null : Math.round(generating.avg),
    recent: recent.map((row) => ({ id: row.id, title: row.title, topic: row.topic, status: row.status, views: row.views, createdAt: row.created_at })),
  };
}
