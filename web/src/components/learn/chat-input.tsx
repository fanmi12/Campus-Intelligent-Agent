"use client";

import { ArrowUp, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE } from "@/lib/learn/stream";
import styles from "./learn.module.css";

// 讨论页和「问狮老师」共用的输入框：电脑上回车发送（Shift+回车换行），手机上回车换行、点按钮发送；
// 输入法选字时按回车不发送（参考聊天的 composer）
export function ChatInput({
  busy,
  placeholder,
  onSend,
  onStop,
  className = "",
}: {
  busy: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onStop: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const canSend = !busy && text.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    submit();
  }

  return (
    <div className={`${styles.composer} ${className}`}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, MAX_MESSAGE))}
        onKeyDown={onKeyDown}
        rows={1}
        enterKeyHint="send"
        placeholder={placeholder}
        aria-label={placeholder}
        className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/70 [field-sizing:content]"
      />
      {busy ? (
        <Button size="icon" aria-label="停止" onClick={onStop}>
          <Square className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button size="icon" aria-label="发送" disabled={!canSend} onClick={submit}>
          <ArrowUp />
        </Button>
      )}
    </div>
  );
}
