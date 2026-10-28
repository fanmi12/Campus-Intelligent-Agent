import assert from "node:assert/strict";
import type { AppUIMessage } from "../src/lib/ai/types";

// 历史对话存储：用内存版 localStorage 模拟浏览器，可设置容量上限
class MemoryStorage {
  data = new Map<string, string>();
  limit = Infinity;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    const size = [...this.data].reduce((sum, [k, v]) => sum + (k === key ? 0 : k.length + v.length), 0) + key.length + value.length;
    if (size > this.limit) throw new Error("QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const message = (id: string, role: "user" | "assistant", text: string) => ({ id, role, parts: [{ type: "text", text }] }) as AppUIMessage;

async function main() {
  const storage = new MemoryStorage();
  Object.assign(globalThis, { localStorage: storage });
  // 旧版本只存一段对话
  storage.setItem("campus-agent:chat:v1", JSON.stringify({ id: "legacy", messages: [message("l1", "user", "图书馆几点开门？"), message("l2", "assistant", "8 点")] }));
  const store = await import("../src/components/chat/storage");

  assert.deepEqual(store.listChats().map((chat) => chat.title), ["图书馆几点开门？"], "旧对话搬进历史");
  assert.equal(storage.getItem("campus-agent:chat:v1"), null);
  assert.equal(store.loadChat()?.id, "legacy", "没有指定时打开最近的对话");

  const id = store.getClientId();
  assert.match(id, /^[\w-]{8,64}$/);
  assert.equal(store.getClientId(), id, "浏览器标识保持不变");

  assert.equal(store.saveChat({ id: "empty", messages: [] }), false, "空对话不进历史");
  const chat = { id: "c1", messages: [message("u1", "user", "  食堂\n几点开门？ ")] };
  assert.equal(store.saveChat(chat), true);
  const before = store.listChats().find((item) => item.id === "c1")!;
  assert.equal(before.title, "食堂 几点开门？");
  assert.equal(store.saveChat(chat), false, "没有新消息时不改排序");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(store.saveChat({ id: "c1", messages: [...chat.messages, message("a1", "assistant", "7 点")] }), true);
  assert.ok(store.listChats()[0].id === "c1" && store.listChats()[0].updatedAt > before.updatedAt);

  // 上次点了新对话、还没发消息：重新打开时仍是新对话
  store.setActiveChat("not-saved-yet");
  assert.equal(store.loadChat(), null);
  store.setActiveChat("legacy");
  assert.equal(store.loadChat()?.id, "legacy");

  const deleted = store.deleteChat("legacy");
  assert.ok(deleted);
  assert.equal(store.loadChat("legacy"), null);
  assert.ok(store.restoreChat(deleted!));
  assert.equal(store.listChats().find((item) => item.id === "legacy")?.updatedAt, deleted!.summary.updatedAt, "撤销后按原时间放回");

  // 最多保留 30 段，最旧的先删
  for (let i = 0; i < 35; i++) store.saveChat({ id: `bulk-${i}`, messages: [message(`b${i}`, "user", `问题 ${i}`)] });
  assert.equal(store.listChats().length, 30);
  assert.equal(store.loadChat("legacy"), null);

  // 空间不够时删掉最旧的对话再存
  storage.limit = [...storage.data].reduce((sum, [k, v]) => sum + k.length + v.length, 0) + 200;
  assert.equal(store.saveChat({ id: "big", messages: [message("g1", "user", "长".repeat(1500))] }), true);
  assert.ok(store.listChats().length < 30 && store.loadChat("big"));
  console.log("PASS: legacy migration, client id, titles, unchanged saves, active chat, delete/undo, 30-chat cap, quota pruning");
}
void main();
