"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LESSON_ID } from "@/lib/learn/schema";
import { adminEnabled, checkPassword, endAdminSession, isAdmin, startAdminSession } from "@/lib/server/admin-auth";
import { ingestKnowledge } from "@/lib/server/kb/ingest";
import { learnJobs } from "@/lib/server/learn/jobs";
import { deleteLesson, isBuiltinLesson } from "@/lib/server/learn/store";
import { setQuestionStatus, type QuestionStatus } from "@/lib/server/logs";
import { rateLimit } from "@/lib/server/rate-limit";

export type LoginState = { error?: string };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  if (!adminEnabled()) return { error: "后台未启用：请先在服务器上配置 ADMIN_PASSWORD" };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`login:${ip}`, 5, 5 * 60_000)) return { error: "尝试次数太多，请 5 分钟后再试" };
  if (!checkPassword(String(formData.get("password") ?? ""))) return { error: "密码不对，再试一次" };
  await startAdminSession();
  redirect("/admin");
}

export async function logout() {
  await endAdminSession();
  redirect("/admin");
}

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("登录已过期，请刷新页面重新登录");
}

export async function rebuildKnowledge(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  try {
    const report = await ingestKnowledge();
    refresh();
    return {
      ok: true,
      message: `已导入 ${report.files} 个文件、${report.chunks} 段；新计算向量 ${report.embedded} 段，删除旧段落 ${report.removed} 段`,
    };
  } catch (error) {
    return { ok: false, message: `导入失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

const STATUSES: QuestionStatus[] = ["open", "resolved", "ignored"];

export async function updateQuestionStatus(id: string, status: QuestionStatus) {
  await requireAdmin();
  if (typeof id !== "string" || !STATUSES.includes(status)) throw new Error("参数不正确");
  setQuestionStatus(id, status);
  refresh();
}

// 小狮课堂：删除一节课（内容审核）。正在生成的任务一并停掉
export async function deleteLessonAction(id: string) {
  await requireAdmin();
  if (typeof id !== "string" || !LESSON_ID.test(id) || isBuiltinLesson(id)) throw new Error("参数不正确");
  learnJobs.get(id)?.abort();
  deleteLesson(id);
  refresh();
}
