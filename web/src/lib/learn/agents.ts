import type { AgentId } from "./schema";

// 课堂里的三位角色（前端显示用；人设提示词在服务端 discuss.ts）
export type AgentInfo = { id: AgentId; name: string; role: string; initial: string };

export const AGENTS: Record<AgentId, AgentInfo> = {
  teacher: { id: "teacher", name: "狮老师", role: "AI 老师", initial: "师" },
  xiaolin: { id: "xiaolin", name: "小林", role: "AI 同学 · 爱举例", initial: "林" },
  xiaomei: { id: "xiaomei", name: "小美", role: "AI 同学 · 爱提问", initial: "美" },
};
