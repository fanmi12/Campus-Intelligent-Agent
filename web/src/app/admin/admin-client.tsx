"use client";

import { Check, EyeOff, Loader2, LogIn, RefreshCw, RotateCcw } from "lucide-react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuestionStatus } from "@/lib/server/logs";
import { login, rebuildKnowledge, updateQuestionStatus, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-3">
      <Input
        name="password"
        type="password"
        placeholder="管理员密码"
        autoComplete="current-password"
        required
        autoFocus
        className="h-11 rounded-xl"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="h-11 w-full rounded-xl" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        登录
      </Button>
    </form>
  );
}

export function RebuildButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await rebuildKnowledge();
          if (result.ok) toast.success("知识库已更新", { description: result.message });
          else toast.error(result.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {pending ? "导入中…" : "重新导入知识库"}
    </Button>
  );
}

export function StatusButtons({ id, status }: { id: string; status: QuestionStatus }) {
  const [pending, startTransition] = useTransition();
  const set = (next: QuestionStatus, message: string) =>
    startTransition(async () => {
      try {
        await updateQuestionStatus(id, next);
        toast.success(message);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "操作失败");
      }
    });

  if (status !== "open") {
    return (
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => set("open", "已重新打开")}>
        <RotateCcw />
        重新打开
      </Button>
    );
  }
  return (
    <div className="flex gap-1.5">
      <Button size="xs" variant="secondary" disabled={pending} onClick={() => set("resolved", "已标记为已补充资料")}>
        <Check />
        已补充
      </Button>
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => set("ignored", "已忽略")}>
        <EyeOff />
        忽略
      </Button>
    </div>
  );
}
