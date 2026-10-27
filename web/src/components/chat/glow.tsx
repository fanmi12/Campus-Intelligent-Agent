import { useId } from "react";
import { cn } from "@/lib/utils";

// 底部氛围光：平时很淡，AI 回答时变亮（样式见 globals.css 的 .aurora）
export function Aurora({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="aurora" data-active={active}>
      <span />
      <span />
      <span />
    </div>
  );
}

// 思考中的四角星：渐变填充，边转边呼吸
export function Spark({ className }: { className?: string }) {
  const id = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("spark size-5 shrink-0", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--glow-blue)" }} />
          <stop offset="0.4" style={{ stopColor: "var(--glow-violet)" }} />
          <stop offset="0.7" style={{ stopColor: "var(--glow-pink)" }} />
          <stop offset="1" style={{ stopColor: "var(--glow-orange)" }} />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5c.55 5.6 4.9 9.95 10.5 10.5-5.6.55-9.95 4.9-10.5 10.5C11.45 16.9 7.1 12.55 1.5 12 7.1 11.45 11.45 7.1 12 1.5Z"
        fill={`url(#${id})`}
      />
    </svg>
  );
}
