import { z } from "zod";
import { agentIdSchema, type AgentId } from "./schema";

// 讨论、提问接口的流式协议：每行一个 JSON（NDJSON）。服务端写、浏览器读，类型和解析器放在这里共用。

export type DiscussEvent =
  | { type: "queue"; position: number } // 排队中，前面还有几位
  | { type: "turn"; id: string; agent: AgentId } // 某位角色开始发言
  | { type: "delta"; id: string; text: string } // 发言的一小段文字
  | { type: "end"; id: string } // 这位角色说完了
  | { type: "error"; message: string } // 出错了（中文短句）
  | { type: "done" }; // 这一轮全部结束

export const MAX_MESSAGE = 300;
export const MAX_HISTORY = 12;

export const discussRequestSchema = z.object({
  sceneId: z.string().regex(/^[\w-]{1,16}$/, "请求格式不正确"),
  // ask：就当前页向狮老师提问；discuss：在讨论页发言，AI 同学和老师依次回应
  mode: z.enum(["ask", "discuss"]),
  message: z.string().trim().min(1, "请先写下想说的话").max(MAX_MESSAGE, `一次最多 ${MAX_MESSAGE} 字`),
  history: z
    .array(z.object({ agent: z.union([z.literal("user"), agentIdSchema]), text: z.string().max(600) }))
    .max(MAX_HISTORY)
    .default([]),
});
export type DiscussRequest = z.infer<typeof discussRequestSchema>;
export type Turn = DiscussRequest["history"][number];

export const encodeEvent = (event: DiscussEvent): string => `${JSON.stringify(event)}\n`;

// 浏览器端：逐行解析。中文是多字节字符，可能被切在两个数据块之间，所以要用 TextDecoder 的 stream 模式；
// 坏行跳过，不让一行坏数据中断整场讨论
export async function readEvents(response: Response, onEvent: (event: DiscussEvent) => void): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (line: string) => {
    const text = line.trim();
    if (!text) return;
    try {
      onEvent(JSON.parse(text) as DiscussEvent);
    } catch {
      // 坏行跳过
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      flush(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
    if (done) break;
  }
  flush(buffer);
}
