"use client";

import type { FileUIPart } from "ai";
import { ArrowUp, ImagePlus, Loader2, Square, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/config";
import { compressImage } from "@/lib/image";

const MAX_IMAGES = 3;

type Props = {
  busy: boolean;
  visionEnabled: boolean;
  onSend: (text: string, files: FileUIPart[]) => void;
  onStop: () => void;
};

export function Composer({ busy, visionEnabled, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<FileUIPart[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // 输入框随内容自动长高，最多 160px
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [text]);

  const canSend = !busy && !processing && (text.trim().length > 0 || images.length > 0);

  async function addFiles(files: File[]) {
    if (!visionEnabled) {
      toast.info("当前没有开启识图功能", { description: "需要在服务器配置 VISION_MODEL" });
      return;
    }
    const list = files.filter((file) => file.type.startsWith("image/")).slice(0, MAX_IMAGES - images.length);
    if (!list.length) {
      if (files.length) toast.info(`最多一次发送 ${MAX_IMAGES} 张图片`);
      return;
    }
    setProcessing(true);
    try {
      const compressed = await Promise.all(list.map((file) => compressImage(file)));
      setImages((current) =>
        [...current, ...compressed.map((image) => ({ type: "file" as const, ...image }))].slice(0, MAX_IMAGES),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片处理失败");
    } finally {
      setProcessing(false);
    }
  }

  function submit() {
    if (!canSend) return;
    onSend(text.trim(), images);
    setText("");
    setImages([]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 输入法选字时按回车不发送；手机上回车换行，用发送按钮发送
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    submit();
  }

  return (
    <div className="relative z-10">
      <div className="mx-auto w-full max-w-2xl px-3 pt-2.5 pb-safe">
        {images.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto scrollbar-none">
            {images.map((image, index) => (
              <div key={index} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- 本地预览 */}
                <img src={image.url} alt="待发送的图片" className="size-16 rounded-xl border object-cover" />
                <button
                  type="button"
                  aria-label="移除图片"
                  onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 流光边框：聚焦时出现，回答中转得更快（样式见 globals.css 的 glow-frame） */}
        <div className="glow-frame rounded-[1.7rem] shadow-sm" data-active={busy}>
          <div className="flex items-end gap-1 rounded-[calc(1.7rem-1.5px)] bg-card p-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              aria-label="添加图片"
              disabled={processing || images.length >= MAX_IMAGES}
              onClick={() => (visionEnabled ? fileInput.current?.click() : addFiles([]))}
            >
              {processing ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            </Button>
            <textarea
              ref={textarea}
              rows={1}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (files.length) {
                  event.preventDefault();
                  void addFiles(files);
                }
              }}
              placeholder="提问，或发一张通知截图"
              enterKeyHint="send"
              aria-label="输入消息"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-[7px] text-[15px] leading-[22px] outline-none placeholder:text-muted-foreground/70"
            />
            {busy ? (
              <Button size="icon" aria-label="停止生成" onClick={onStop}>
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button size="icon" aria-label="发送" disabled={!canSend} onClick={submit}>
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/80">{site.disclaimer}</p>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) void addFiles(Array.from(event.target.files));
          event.target.value = "";
        }}
      />
    </div>
  );
}
