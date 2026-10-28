import type { AppUIMessage } from "@/lib/ai/types";

// 对话保存在浏览器本地，刷新页面不丢，也能在「历史对话」里切换。图片太大不保存，只留占位。
// 目录（标题、时间）和每段对话分开存，保存时只改写当前这一段
const INDEX_KEY = "campus-agent:chats:v2";
const ACTIVE_KEY = "campus-agent:active-chat";
const LEGACY_KEY = "campus-agent:chat:v1";
const CLIENT_KEY = "campus-agent:client-id";
const chatKey = (id: string) => `campus-agent:chat:v2:${id}`;
const MAX_SAVED = 40;
const MAX_CHATS = 30;

export type SavedChat = { id: string; messages: AppUIMessage[] };
// count、lastId 用来判断有没有新消息：只是打开看看的对话不改排序
export type ChatSummary = { id: string; title: string; updatedAt: number; count: number; lastId: string };
export type DeletedChat = { chat: SavedChat; summary: ChatSummary };

export function createChatId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

let memoryClientId: string | undefined;

// 匿名的浏览器标识，只用于服务端排队限流（同一 Wi-Fi 下的同学分开计数），不关联个人身份
export function getClientId(): string {
  try {
    const saved = localStorage.getItem(CLIENT_KEY);
    if (saved && /^[\w-]{8,64}$/.test(saved)) return saved;
    const id = createChatId();
    localStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    memoryClientId ??= createChatId();
    return memoryClientId;
  }
}

export function stripImageData(message: AppUIMessage): AppUIMessage {
  if (!message.parts.some((part) => part.type === "file" && part.url)) return message;
  return {
    ...message,
    parts: message.parts.map((part) => (part.type === "file" ? { ...part, url: "" } : part)),
  };
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isSummary(value: unknown): value is ChatSummary {
  const item = value as ChatSummary;
  return typeof item?.id === "string" && typeof item.title === "string" && typeof item.updatedAt === "number";
}

function readIndex(): ChatSummary[] {
  migrateLegacy();
  const index = read(INDEX_KEY);
  return Array.isArray(index) ? index.filter(isSummary) : [];
}

function remove(id: string) {
  try {
    localStorage.removeItem(chatKey(id));
  } catch {
    // 隐私模式下读写都会失败，忽略
  }
}

// 旧版本只存一段对话：第一次打开新版本时搬进历史记录
let migrated = false;
function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  const legacy = read(LEGACY_KEY) as SavedChat | null;
  if (typeof legacy?.id !== "string" || !Array.isArray(legacy.messages)) return;
  if (legacy.messages.length && !saveChat(legacy)) return;
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // 同上
  }
}

export function listChats(): ChatSummary[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

// 不传 id 时打开上次在看的对话；上次点了「新对话」还没发消息时返回 null
export function loadChat(id?: string): SavedChat | null {
  const index = listChats();
  let target = id;
  if (!target) {
    let active: string | null = null;
    try {
      active = localStorage.getItem(ACTIVE_KEY);
    } catch {
      // 同上
    }
    target = active ? index.find((chat) => chat.id === active)?.id : index[0]?.id;
  }
  if (!target) return null;
  const messages = read(chatKey(target));
  return Array.isArray(messages) ? { id: target, messages: messages as AppUIMessage[] } : null;
}

export function setActiveChat(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // 同上
  }
}

function chatTitle(messages: AppUIMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text.length > 30 ? `${text.slice(0, 30)}…` : text;
    if (message.parts.some((part) => part.type === "file")) return "图片提问";
  }
  return "新对话";
}

function writeEntry(chat: SavedChat, summary: ChatSummary, others: ChatSummary[]): boolean {
  const rest = [...others];
  for (;;) {
    try {
      localStorage.setItem(chatKey(chat.id), JSON.stringify(chat.messages.slice(-MAX_SAVED).map(stripImageData)));
      localStorage.setItem(INDEX_KEY, JSON.stringify([summary, ...rest]));
      return true;
    } catch {
      // 空间不够时从最旧的对话删起；隐私模式下删完也存不了，就放弃
      const oldest = rest.pop();
      if (!oldest) return false;
      remove(oldest.id);
    }
  }
}

// 保存当前对话，返回历史记录是否有变化。没有消息的新对话不进历史
export function saveChat(chat: SavedChat): boolean {
  const last = chat.messages.at(-1);
  if (!last) return false;
  const index = readIndex();
  const previous = index.find((item) => item.id === chat.id);
  if (previous?.count === chat.messages.length && previous.lastId === last.id) return false;
  const others = index.filter((item) => item.id !== chat.id).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const old of others.splice(MAX_CHATS - 1)) remove(old.id);
  const summary = { id: chat.id, title: chatTitle(chat.messages), updatedAt: Date.now(), count: chat.messages.length, lastId: last.id };
  return writeEntry(chat, summary, others);
}

// 删除一段对话，返回删掉的内容，方便「撤销」
export function deleteChat(id: string): DeletedChat | null {
  const index = readIndex();
  const summary = index.find((item) => item.id === id);
  const chat = loadChat(id);
  remove(id);
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index.filter((item) => item.id !== id)));
  } catch {
    // 同上
  }
  return chat && summary ? { chat, summary } : null;
}

// 撤销删除：按原来的时间放回历史
export function restoreChat({ chat, summary }: DeletedChat): boolean {
  const others = readIndex().filter((item) => item.id !== chat.id).sort((a, b) => b.updatedAt - a.updatedAt);
  return writeEntry(chat, summary, others);
}
