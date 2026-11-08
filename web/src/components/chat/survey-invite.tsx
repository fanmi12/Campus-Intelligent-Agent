"use client";

import { ClipboardList, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/config";

const { questions, minutes } = site.survey;

// 拿到完整回答后跟在最新一条回答下面，随对话滚动，不挡内容；关掉后只留菜单里的入口
export function SurveyInvite({
  resume,
  onOpen,
  onDismiss,
}: {
  resume: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside aria-label="体验问卷邀请" className="animate-enter flex gap-3">
      {/* 电脑上和回答正文对齐，左边空出头像那一列；手机上用满宽度 */}
      <div aria-hidden className="hidden w-7 shrink-0 sm:block" />
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border bg-card/90 py-2.5 pr-2 pl-3 shadow-xs">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <ClipboardList className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-5 font-medium">{resume ? "体验问卷还没提交" : "这次用得怎么样？"}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {resume ? "刚才的进度还在，接着填就行" : `填个体验问卷，${questions} 题约 ${minutes} 分钟`}
          </p>
        </div>
        <Button size="sm" onClick={onOpen}>
          {resume ? "继续" : "填写"}
        </Button>
        <button
          type="button"
          aria-label="不再提示体验问卷"
          title="不再提示"
          onClick={() => {
            onDismiss();
            toast("好的，不再提示", { description: "之后可以在右上角「⋯」菜单里找到体验问卷" });
          }}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
}
