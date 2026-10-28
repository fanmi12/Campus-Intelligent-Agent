"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import { AlertCircle, ArrowDown, FlaskConical, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import type { AppUIMessage } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { ChatHistory } from "./chat-history";
import { Composer } from "./composer";
import { Aurora } from "./glow";
import { ChatHeader } from "./header";
import { AssistantMessage, ThinkingMessage, UserMessage } from "./message";
import { PrivacyDialog } from "./privacy-dialog";
import {
  createChatId,
  deleteChat,
  getClientId,
  listChats,
  loadChat,
  restoreChat,
  saveChat,
  setActiveChat,
  stripImageData,
  type ChatSummary,
  type DeletedChat,
  type SavedChat,
} from "./storage";
import { useAppStatus } from "./use-app-status";
import { Welcome } from "./welcome";

// 只有最新一条消息带图片原图，历史图片的识别结果服务端会从对话里取，省流量。
// 浏览器标识只用于排队限流，同一个 Wi-Fi 下的同学分开计数
const transport = new DefaultChatTransport<AppUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages }) => ({
    headers: { "X-Client-Id": getClientId() },
    body: {
      id,
      messages: messages.map((message, index) => (index === messages.length - 1 ? message : stripImageData(message))),
    },
  }),
});

function friendlyError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // 不是 JSON，按原文处理
  }
  // 服务端在回答流里给的排队、限流提示本身就是中文短句，直接展示
  if (/^[一-鿿][^\n]{0,60}$/.test(error.message)) return error.message;
  if (/fetch|network|Failed/i.test(error.message)) return "网络好像断了，检查一下网络再试";
  return "出了点问题，请稍后再试";
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <button
        type="button"
        onClick={() => scrollToBottom()}
        aria-label="回到最新消息"
        tabIndex={isAtBottom ? -1 : 0}
        aria-hidden={isAtBottom}
        className={cn(
          "grid size-9 place-items-center rounded-full border bg-card text-muted-foreground shadow-md transition duration-200",
          isAtBottom ? "translate-y-2 opacity-0" : "pointer-events-auto translate-y-0 opacity-100",
        )}
      >
        <ArrowDown className="size-4" />
      </button>
    </div>
  );
}

function ChatSession({
  session,
  demo,
  visionEnabled,
  onNewChat,
  onOpenHistory,
  onOpenPrivacy,
  onHistoryChange,
}: {
  session: SavedChat;
  demo: boolean;
  visionEnabled: boolean;
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenPrivacy: () => void;
  onHistoryChange: (chats: ChatSummary[]) => void;
}) {
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat<AppUIMessage>({
    id: session.id,
    messages: session.messages,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  // 回答结束后存到本地；有新消息时刷新历史列表
  useEffect(() => {
    if (!busy && saveChat({ id: session.id, messages })) onHistoryChange(listChats());
  }, [busy, messages, session.id, onHistoryChange]);

  function send(text: string, files: FileUIPart[] = []) {
    if (busy) return;
    clearError();
    void sendMessage({ text: text || "帮我看看这张图", files });
  }

  const last = messages.at(-1);

  return (
    <div className="relative flex h-dvh flex-col bg-aurora">
      {/* 底部氛围光放在最前面，消息和输入框都在它上层 */}
      <Aurora active={busy} />
      <ChatHeader
        onNewChat={onNewChat}
        onOpenHistory={onOpenHistory}
        onOpenPrivacy={onOpenPrivacy}
        canReset={messages.length > 0 && !busy}
        busy={busy}
      />

      {demo && (
        <div className="mx-auto w-full max-w-2xl px-4 pt-2">
          <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5 text-foreground/80">
            <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning" />
            演示模式：还没配置大模型 Key，回答由程序模拟。配置方法见项目 README。
          </div>
        </div>
      )}

      <StickToBottom className="relative flex-1 overflow-y-auto" resize="smooth" initial="instant">
        <StickToBottom.Content className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-5 pb-8">
          {messages.length === 0 ? (
            <Welcome onSelect={(prompt) => send(prompt)} onPrivacy={onOpenPrivacy} />
          ) : (
            messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              return message.role === "user" ? (
                <UserMessage key={message.id} message={message} />
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  streaming={busy && isLast}
                  onRegenerate={isLast && !busy ? () => void regenerate() : undefined}
                />
              );
            })
          )}

          {status === "submitted" && last?.role === "user" && <ThinkingMessage />}

          {error && (
            <div className="flex items-center gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm">
              <AlertCircle className="size-4 shrink-0 text-destructive" />
              <span className="flex-1">{friendlyError(error)}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  clearError();
                  void regenerate();
                }}
              >
                <RotateCcw />
                重试
              </Button>
            </div>
          )}
        </StickToBottom.Content>
        <ScrollToBottomButton />
      </StickToBottom>

      <Composer busy={busy} visionEnabled={visionEnabled} onSend={send} onStop={stop} />
    </div>
  );
}

export default function ChatApp() {
  // 这个组件只在浏览器里渲染（见 chat.tsx），可以直接读 localStorage
  const [session, setSession] = useState<SavedChat>(() => loadChat() ?? { id: createChatId(), messages: [] });
  const [chats, setChats] = useState<ChatSummary[]>(listChats);
  // 历史面板放在会话外层：删掉当前对话、换成新对话时面板不跟着关
  const [historyOpen, setHistoryOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [deleted, setDeleted] = useState<DeletedChat | null>(null);
  const appStatus = useAppStatus();

  // 撤销入口保留 8 秒
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(null), 8000);
    return () => clearTimeout(timer);
  }, [deleted]);

  function openChat(next: SavedChat) {
    setActiveChat(next.id);
    setSession(next);
  }

  const newChat = () => openChat({ id: createChatId(), messages: [] });

  // 删的是当前对话就换成一段新对话
  function remove(id: string) {
    setDeleted(deleteChat(id));
    setChats(listChats());
    if (id === session.id) newChat();
  }

  function undo() {
    if (deleted && restoreChat(deleted)) setChats(listChats());
    setDeleted(null);
  }

  return (
    <>
      <ChatSession
        key={session.id}
        session={session}
        demo={appStatus?.demo ?? false}
        visionEnabled={appStatus?.vision ?? false}
        onHistoryChange={setChats}
        onNewChat={newChat}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenPrivacy={() => setPrivacyOpen(true)}
      />
      <ChatHistory
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setDeleted(null);
        }}
        chats={chats}
        currentId={session.id}
        deletedTitle={deleted?.summary.title}
        onSelect={(id) => {
          setHistoryOpen(false);
          const chat = id === session.id ? null : loadChat(id);
          if (chat) openChat(chat);
        }}
        onNewChat={() => {
          setHistoryOpen(false);
          newChat();
        }}
        onDelete={remove}
        onUndo={undo}
        onPrivacy={() => {
          setHistoryOpen(false);
          setPrivacyOpen(true);
        }}
      />
      <PrivacyDialog open={privacyOpen} onOpenChange={setPrivacyOpen} />
    </>
  );
}
