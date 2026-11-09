"use client";

import { Ellipsis, Link2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { getClientId } from "@/components/chat/storage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Lesson } from "@/lib/learn/schema";
import { removeLocalLesson } from "./learn-storage";

// 课堂页右上角的「⋯」菜单：复制链接、重新生成失败页、删除（后两项只有创建者有）
export function LessonMenu({ lesson, owner, canRetry, onRetry }: { lesson: Lesson; owner: boolean; canRetry: boolean; onRetry: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const builtin = Boolean(lesson.demo || lesson.featured);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/learn/${lesson.id}`);
      toast.success("链接已复制，拿到链接的人都能看到这节课");
    } catch {
      toast.error("复制失败，请长按地址栏里的链接复制");
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/learn/lessons/${lesson.id}`, { method: "DELETE", headers: { "X-Client-Id": getClientId() } });
      if (!response.ok && response.status !== 404) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "删除失败，请稍后再试");
      }
      removeLocalLesson(lesson.id);
      toast.success("这节课已删除");
      router.push("/learn");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后再试");
      setDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="更多操作" />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={copyLink}>
            <Link2 />
            复制链接
          </DropdownMenuItem>
          {owner && !builtin && canRetry && (
            <DropdownMenuItem onClick={onRetry}>
              <RefreshCw />
              重新生成失败页
            </DropdownMenuItem>
          )}
          {owner && !builtin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                <Trash2 />
                删除这节课
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={(open) => !deleting && setConfirming(open)}>
        <DialogContent className="gap-4 rounded-3xl">
          <DialogHeader className="pr-8">
            <DialogTitle>删除这节课？</DialogTitle>
            <DialogDescription>删除后，拿到链接的人也打不开了，无法恢复。你在这台设备上的学习进度也会一并清除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setConfirming(false)}>
              取消
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={remove}>
              {deleting ? "正在删除…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
