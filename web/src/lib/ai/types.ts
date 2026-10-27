import type { InferUITools, UIMessage } from "ai";
import type { AppTools } from "./tools";

// 一条参考资料（回答里的 [1][2] 对应这里的 n）
export type SourceItem = {
  n: number;
  id: string;
  title: string;
  heading?: string;
  snippet: string;
  url?: string;
  updated?: string;
  kind?: "knowledge" | "web";
};

// 服务端随回答一起推送给前端的自定义数据
export type AppDataParts = {
  queue: { status: "waiting" | "running"; position: number; waiting: number; active: number };
  sources: { items: SourceItem[]; lowConfidence: boolean };
  vision: { status: "loading" | "done" | "error"; images: number; text?: string };
  webSearch: { status: "loading" | "done" | "error"; action: "search" | "fetch"; query: string; count?: number; error?: string };
};

export type AppMetadata = {
  createdAt?: number;
  demo?: boolean;
};

export type AppUIMessage = UIMessage<AppMetadata, AppDataParts, InferUITools<AppTools>>;
