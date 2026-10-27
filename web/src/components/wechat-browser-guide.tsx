"use client";

import { useState, useSyncExternalStore } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Copy, CornerRightUp, Ellipsis, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const isWeChat = () => /MicroMessenger/i.test(navigator.userAgent);
const serverSnapshot = () => false;

export function WeChatBrowserGuide() {
  const inWeChat = useSyncExternalStore(subscribe, isWeChat, serverSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState("");

  async function copyLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setManualLink("");
    } catch {
      setCopied(false);
      setManualLink(url);
    }
  }

  return (
    <Dialog.Root open={inWeChat && !dismissed} onOpenChange={(open) => { if (!open) setDismissed(true); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Popup className="fixed inset-0 z-50 overflow-y-auto px-6 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)] text-white outline-none">
          <div className="ml-auto w-full max-w-sm">
            <div className="mb-5 flex justify-end" aria-hidden="true">
              <CornerRightUp className="h-20 w-16" strokeWidth={1.5} />
            </div>
            <Dialog.Title className="text-2xl leading-snug font-semibold">请在浏览器中打开</Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-7 text-white/80">
              当前在微信中打开此页面，请按下面两步切换到手机浏览器。
            </Dialog.Description>
            <ol className="mt-7 space-y-5 text-base leading-7">
              <li className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/40 text-sm" aria-hidden="true">1</span>
                <span>点击微信右上角 <Ellipsis className="inline size-6 align-middle" aria-label="三个点菜单" /></span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/40 text-sm" aria-hidden="true">2</span>
                <span>选择 <strong className="font-semibold">在浏览器中打开</strong> <ExternalLink className="inline size-4 align-middle" aria-hidden="true" /></span>
              </li>
            </ol>
            <p className="mt-4 text-sm leading-6 text-white/80">iPhone 上也可能显示「在 Safari 中打开」。</p>
            <div className="mt-8 space-y-2">
              <Button type="button" variant="outline" className="h-11 w-full border-white/50 bg-transparent text-white hover:bg-white/15 hover:text-white" onClick={copyLink}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? "已复制链接" : "复制链接"}
              </Button>
              <p role="status" className="text-sm leading-6 text-white/80">
                {copied ? "打开手机浏览器，粘贴链接即可访问。" : manualLink ? "未能自动复制，请长按下方链接复制。" : "找不到菜单选项？可以复制链接到浏览器。"}
              </p>
              {manualLink && (
                <input
                  aria-label="当前页面链接"
                  readOnly
                  value={manualLink}
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                  className="h-11 w-full min-w-0 rounded-lg border border-white/50 bg-transparent px-3 text-sm text-white selection:bg-white selection:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                />
              )}
              <Dialog.Close render={<Button variant="ghost" className="mt-3 h-11 w-full text-white hover:bg-white/15 hover:text-white" />}>
                继续在微信中使用
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
