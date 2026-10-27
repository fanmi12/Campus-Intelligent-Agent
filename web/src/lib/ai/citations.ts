import type { SourceItem } from "./types";

function pageKey(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    url.hash = "";
    return url.href;
  } catch { return undefined; }
}

// 联网和知识库共用编号角标；模型偶尔返回原始网址时也不把长地址铺在回答里。
export function formatAnswerCitations(text: string, sources: SourceItem[]): string {
  const numbers = new Map(sources.filter((source) => source.url).map((source) => [pageKey(source.url!), source.n]));
  const reference = (url: string) => {
    const key = pageKey(url);
    const n = key ? numbers.get(key) : undefined;
    return n ? `[${n}]` : "";
  };
  return text
    .replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g, (_, label: string, url: string) => reference(url) || (/https?:\/\//i.test(label) ? "" : label))
    .replace(/<(https?:\/\/[^>]+)>/g, (_, url: string) => reference(url))
    .replace(/https?:\/\/[^\s<>，。；！？、\[\]"）)]+/g, (url) => reference(url.replace(/[.,;]+$/, "")))
    .replace(/(\[\d{1,2}\])(?:\s*\1)+/g, "$1");
}
