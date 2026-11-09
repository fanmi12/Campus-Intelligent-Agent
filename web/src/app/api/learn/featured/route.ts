import { demoLesson } from "@/lib/learn/fixtures";
import { isDemoMode } from "@/lib/server/env";
import { disabled, reply } from "@/lib/server/learn/api";
import { summarize } from "@/lib/server/learn/store";

export const dynamic = "force-dynamic";

// 精选课程：团队生成并人工核对过的课程，打开即看，不需要等待生成。
// 目前还没有精选课程；演示模式下展示示例课程，方便走通界面
export function GET() {
  const off = disabled();
  if (off) return off;
  return reply({ items: isDemoMode ? [summarize(demoLesson)] : [] });
}
