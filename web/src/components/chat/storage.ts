import type { AppUIMessage } from "@/lib/ai/types";

// 对话保存在浏览器本地，刷新页面不丢。图片太大不保存，只留占位。
const KEY = "campus-agent:chat:v1";
const MAX_SAVED = 40;

export type SavedChat = { id: string; messages: AppUIMessage[] };

export function createChatId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function stripImageData(message: AppUIMessage): AppUIMessage {
  if (!message.parts.some((part) => part.type === "file" && part.url)) return message;
  return {
    ...message,
    parts: message.parts.map((part) => (part.type === "file" ? { ...part, url: "" } : part)),
  };
}

export function loadChat(): SavedChat | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedChat;
    if (typeof data?.id !== "string" || !Array.isArray(data.messages)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveChat(chat: SavedChat) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ id: chat.id, messages: chat.messages.slice(-MAX_SAVED).map(stripImageData) }),
    );
  } catch {
    // 隐私模式或空间不足时忽略，不影响使用
  }
}

export function clearChat() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 同上
  }
}
