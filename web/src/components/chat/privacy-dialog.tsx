"use client";

import { ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { site } from "@/lib/config";

// 内容与实际实现一致：提问记录见 server/logs.ts，图片只交给识图模型，聊天记录存在浏览器本地（storage.ts）
const ITEMS: [string, string][] = [
  ["服务器记录什么", "提问和回答的文字、点赞点踩，以及回答用到的资料编号和时间，用来统计常见问题、补充校园资料，管理员可以在后台查看。本站不需要登录，不收集姓名、学号，提问记录里也不保存 IP 地址。"],
  ["图片", "发送的图片只用来识别其中的文字，服务器不保存原图。"],
  ["第三方服务", "为了生成回答，问题会发送给提供对话、识图和检索能力的模型服务商；联网查询会用到搜索服务；地图卡片会向高德地图查询地点。"],
  ["聊天记录", "对话保存在这台设备的浏览器里，可以在「历史对话」中删除，清除浏览器数据也会一并删除。"],
  ["请不要输入", "身份证号、银行卡号、密码、验证码等敏感信息。提问的文字会原样记录。"],
];

export function PrivacyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto rounded-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            隐私说明
          </DialogTitle>
          <DialogDescription>{site.name}如何处理你的提问和对话记录</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-[13px] leading-6">
          {ITEMS.map(([title, text]) => (
            <div key={title}>
              <dt className="font-medium">{title}</dt>
              <dd className="text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-5 text-muted-foreground">{site.disclaimer}。</p>
      </DialogContent>
    </Dialog>
  );
}
