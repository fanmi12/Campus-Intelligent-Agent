import { ArrowLeft, BookOpen, CircleHelp, LogOut, MessagesSquare, ShieldAlert, ThumbsUp, Target, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { BrandAvatar } from "@/components/chat/brand-avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { site } from "@/lib/config";
import { adminEnabled, isAdmin } from "@/lib/server/admin-auth";
import { hasEmbedding, hasRerank, hasVision, isDemoMode } from "@/lib/server/env";
import { knowledgeOverview } from "@/lib/server/kb/ingest";
import { getStats, listGaps, listRecent, type QuestionRow } from "@/lib/server/logs";
import { cn } from "@/lib/utils";
import { logout } from "./actions";
import { LoginForm, RebuildButton, StatusButtons } from "./admin-client";

export const metadata: Metadata = { title: "管理后台", robots: { index: false, follow: false } };

const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-aurora">
      <div className={cn("mx-auto w-full px-4 py-6 sm:py-10", wide ? "max-w-5xl" : "max-w-sm")}>{children}</div>
    </div>
  );
}

function CenterCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="mt-[12vh] rounded-3xl border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <BrandAvatar />
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{site.name} · 管理后台</div>
          </div>
        </div>
        {children}
      </div>
      <Link href="/" className="mt-4 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        返回对话
      </Link>
    </Shell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5", tone === "warning" ? "text-warning" : "text-primary")} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function QuestionList({ rows, empty }: { rows: QuestionRow[]; empty: string }) {
  if (!rows.length) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {rows.map((row) => (
        <li key={row.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{row.question}</div>
            <StatusButtons id={row.id} status={row.status} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{timeFormat.format(row.createdAt)}</span>
            {row.rating === -1 && <Tag tone="destructive">被点踩{row.comment ? `：${row.comment}` : ""}</Tag>}
            {row.rating === 1 && <Tag tone="success">被点赞</Tag>}
            {row.lowConfidence && <Tag tone="warning">资料缺失</Tag>}
            {row.tools.includes("addToCalendar") && <Tag>生成日程</Tag>}
            {row.hasImage && <Tag>含图片</Tag>}
            {row.demo && <Tag>演示模式</Tag>}
            {row.status !== "open" && <Tag>{row.status === "resolved" ? "已补充" : "已忽略"}</Tag>}
          </div>
          {row.answer && (
            <details className="group text-sm text-muted-foreground">
              <summary className="cursor-pointer text-xs select-none hover:text-foreground">查看当时的回答</summary>
              <p className="mt-2 rounded-xl bg-muted/60 p-3 leading-6 whitespace-pre-wrap">{row.answer}</p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "warning" | "destructive" | "success" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "destructive" && "bg-destructive/10 text-destructive",
        tone === "success" && "bg-success/15 text-success",
        !tone && "bg-muted",
      )}
    >
      {children}
    </span>
  );
}

function DailyChart({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <div className="mb-4 text-sm font-medium">近 14 天提问量</div>
      <div className="flex h-32 items-end gap-1.5">
        {days.map((day) => (
          <div key={day.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] text-muted-foreground tabular-nums opacity-0 transition group-hover:opacity-100">
              {day.count}
            </span>
            <div
              className="w-full rounded-t-md bg-primary/80 transition group-hover:bg-primary"
              style={{ height: `${Math.max(2, (day.count / max) * 100)}%`, opacity: day.count ? 1 : 0.25 }}
              title={`${day.date}：${day.count} 次`}
            />
            <span className="text-[10px] text-muted-foreground tabular-nums">{Number(day.date.slice(8))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function AdminPage() {
  // 每次请求时渲染：登录状态、统计数据都是实时的
  await connection();
  if (!adminEnabled()) {
    return (
      <CenterCard title="后台未启用">
        <p className="text-sm leading-6 text-muted-foreground">
          在服务器的环境变量里设置 <code className="rounded bg-muted px-1">ADMIN_PASSWORD</code> 后重启服务，即可用这个密码登录后台。
        </p>
      </CenterCard>
    );
  }
  if (!(await isAdmin())) {
    return (
      <CenterCard title="管理员登录">
        <LoginForm />
      </CenterCard>
    );
  }

  const stats = getStats();
  const gaps = listGaps();
  const recent = listRecent(60);
  const kb = knowledgeOverview();
  const rated = stats.likes + stats.dislikes;

  return (
    <Shell wide>
      <header className="mb-6 flex items-center gap-3">
        <BrandAvatar />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">管理后台</h1>
          <p className="text-xs text-muted-foreground">
            {site.name} ·{" "}
            {isDemoMode ? "演示模式（未接入大模型）" : `已接入大模型${hasVision ? " · 识图" : ""}${hasEmbedding ? " · 语义检索" : ""}${hasRerank ? " · 重排" : ""}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft />
          返回对话
        </Button>
        <form action={logout}>
          <Button variant="ghost" size="icon-sm" type="submit" aria-label="退出登录">
            <LogOut />
          </Button>
        </form>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={MessagesSquare} label="累计提问" value={String(stats.total)} hint={`今天 ${stats.today} 次`} />
        <Stat
          icon={Target}
          label="有资料可答"
          value={stats.answeredRate === null ? "—" : `${Math.round(stats.answeredRate * 100)}%`}
          hint="回答有知识库依据的比例"
        />
        <Stat icon={ShieldAlert} label="待补充资料" value={String(stats.gaps)} hint="答不上或被点踩的问题" tone="warning" />
        <Stat
          icon={ThumbsUp}
          label="满意度"
          value={rated ? `${Math.round((stats.likes / rated) * 100)}%` : "—"}
          hint={`👍 ${stats.likes} · 👎 ${stats.dislikes}`}
        />
        <Stat
          icon={Timer}
          label="首字时间"
          value={stats.firstToken ? `${(stats.firstToken.median / 1000).toFixed(1)} 秒` : "—"}
          hint={stats.firstToken ? `近 7 天中位数 · 九成在 ${(stats.firstToken.p90 / 1000).toFixed(1)} 秒内` : "提问后出现第一个字的时间"}
        />
      </div>

      <div className="mt-3">
        <DailyChart days={stats.daily} />
      </div>

      <Tabs defaultValue="gaps" className="mt-6">
        <TabsList>
          <TabsTrigger value="gaps">待补充 {gaps.length > 0 && `(${gaps.length})`}</TabsTrigger>
          <TabsTrigger value="recent">最近提问</TabsTrigger>
          <TabsTrigger value="kb">知识库</TabsTrigger>
        </TabsList>

        <TabsContent value="gaps" className="mt-4 space-y-3">
          <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0" />
            这些问题知识库里没有答案，或回答被同学点踩。把资料补进 knowledge 文件夹、重新导入后，标记为「已补充」。
          </p>
          <QuestionList rows={gaps} empty="暂时没有待补充的问题 🎉" />
        </TabsContent>

        <TabsContent value="recent" className="mt-4">
          <QuestionList rows={recent} empty="还没有人提问" />
        </TabsContent>

        <TabsContent value="kb" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-xs">
            <div className="text-sm">
              <div className="font-medium">
                共 {kb.docs.toLocaleString()} 份资料、{kb.chunks.toLocaleString()} 段
                {kb.filesOnDisk !== kb.docs && (
                  <span className="ml-2 text-warning">（文件夹里有 {kb.filesOnDisk} 个文件，建议重新导入）</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {kb.lastIngest ? `上次导入：${timeFormat.format(kb.lastIngest.finishedAt)}` : "还没有导入过"}
                {" · "}
                {hasEmbedding
                  ? `关键词 + 语义向量（已算 ${kb.embedded.toLocaleString()} / ${kb.chunks.toLocaleString()} 段）${hasRerank ? " + 重排" : ""}`
                  : `仅关键词检索${hasRerank ? " + 重排" : ""}（配置 EMBEDDING_MODEL 可开启语义检索）`}
              </div>
            </div>
            <RebuildButton />
          </div>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {kb.categories.map((item) => (
              <li key={item.category} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
                <BookOpen className="size-4 text-primary" />
                <span className="font-medium">{item.category}</span>
                <span className="ml-auto flex gap-1.5 text-xs text-muted-foreground">
                  <Tag>{item.docs.toLocaleString()} 篇</Tag>
                  <Tag>{item.chunks.toLocaleString()} 段</Tag>
                  {item.latest && <Tag>最新 {item.latest}</Tag>}
                </span>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
