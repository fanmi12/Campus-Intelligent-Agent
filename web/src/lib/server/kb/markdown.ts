import { createHash } from "node:crypto";

export type ChunkDraft = {
  id: string;
  docPath: string;
  docTitle: string;
  heading: string;
  content: string;
  category?: string;
  // 资料（长期有效）、通知（有时效）、新闻（检索时降权）
  kind?: string;
  sourceUrl?: string;
  updated?: string;
};

// 每段最多多少字；超过就按空行再切开
const MAX_CHUNK_CHARS = 700;

// 官网上正文是图片或附件的页面（如校历、办事流程图），导入时只保留标题、原文链接和这句说明
export const ATTACHMENT_ONLY_NOTE = "这份资料的正文是图片或附件，网页上没有可直接提取的文字，请打开原文链接查看。";

// 只解析简单的 "key: value" 形式的文件头
export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { data: {}, body: raw.replace(/^﻿/, "") };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    if (key && value) data[key] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}

type Section = { path: string[]; lines: string[] };

function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  let stack: string[] = [];
  let current: Section = { path: [], lines: [] };
  let inCodeBlock = false;

  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inCodeBlock = !inCodeBlock;
    const heading = inCodeBlock ? null : line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current.lines.join("").trim()) sections.push(current);
      const level = heading[1].length;
      stack = stack.slice(0, level - 1);
      stack[level - 1] = heading[2].trim();
      current = { path: stack.filter(Boolean), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.join("").trim()) sections.push(current);
  return sections;
}

function splitLongText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const pieces: string[] = [];
  let buffer = "";
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (buffer && buffer.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
      pieces.push(buffer.trim());
      buffer = "";
    }
    buffer += (buffer ? "\n\n" : "") + paragraph;
  }
  if (buffer.trim()) pieces.push(buffer.trim());
  // 单个段落仍然过长时按句号硬切
  return pieces.flatMap((piece) =>
    piece.length <= MAX_CHUNK_CHARS * 1.5
      ? [piece]
      : piece.match(new RegExp(`[\\s\\S]{1,${MAX_CHUNK_CHARS}}(?:[。！？；\\n]|$)`, "g")) ?? [piece],
  );
}

export function chunkMarkdown(docPath: string, raw: string): ChunkDraft[] {
  const { data, body } = parseFrontmatter(raw);
  const firstHeading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const fileName = docPath.split("/").pop()?.replace(/\.md$/i, "") ?? docPath;
  const docTitle = data.title ?? firstHeading ?? fileName;

  const drafts: ChunkDraft[] = [];
  for (const section of splitSections(body)) {
    // 一级标题通常就是文档标题，不重复放进小标题路径里
    const path = section.path[0] === docTitle ? section.path.slice(1) : section.path;
    const heading = path.join(" › ");
    const text = section.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) continue;

    splitLongText(text).forEach((content, index) => {
      // 指纹包含元信息：标题、类型、日期等变了也会重新建索引
      const id = createHash("sha1")
        .update([docPath, docTitle, heading, index, data.category, data.kind, data.source, data.updated, content].join("\n"))
        .digest("hex")
        .slice(0, 16);
      drafts.push({
        id,
        docPath,
        docTitle,
        heading,
        content,
        category: data.category,
        kind: data.kind,
        sourceUrl: data.source,
        updated: data.updated,
      });
    });
  }
  return drafts;
}
