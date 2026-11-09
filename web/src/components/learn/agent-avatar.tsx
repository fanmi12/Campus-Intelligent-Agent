import { BrandAvatar } from "@/components/chat/brand-avatar";
import { AGENTS } from "@/lib/learn/agents";
import type { AgentId } from "@/lib/learn/schema";
import { cn } from "@/lib/utils";

// 狮老师用品牌头像；两位 AI 同学是圆形文字头像，用不同的图表色描边区分
export function AgentAvatar({ agent, size = "md" }: { agent: AgentId; size?: "sm" | "md" }) {
  if (agent === "teacher") return <BrandAvatar size={size} />;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2 bg-card font-semibold select-none",
        size === "sm" ? "size-7 text-xs" : "size-9 text-sm",
        agent === "xiaolin" ? "border-chart-2 text-chart-2" : "border-chart-4 text-chart-4",
      )}
    >
      {AGENTS[agent].initial}
    </span>
  );
}
