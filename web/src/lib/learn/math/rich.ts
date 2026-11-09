import { texToPlain } from "./tex";

// 课程文字里的「富内容」：$…$ 包住的公式，以及写成 [[1,2],[3,4]] 的矩阵。
// 前后端共用，不能 import node: 模块。先把一段文字切成 文字 / 公式 / 矩阵 三种片段，页面再各自渲染。

export type Matrix = { rows: string[][]; aug: number };
export type RichPart = { type: "text"; text: string } | { type: "math"; tex: string } | { type: "matrix"; matrix: Matrix; source: string };

const MAX_MATH = 400;

// 找到 $ 对应的结束位置：开头的 $ 后面不能是空白，结尾的 $ 前面不能是空白、后面不能是数字（"5 元和 $10"这类价格不会被当成公式）
function closingDollar(text: string, from: number): number {
  for (let j = from; j < text.length && j - from <= MAX_MATH; j++) {
    const c = text[j];
    if (c === "\n") return -1;
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "$") {
      if (j === from || /\s/.test(text[j - 1]) || /[0-9]/.test(text[j + 1] ?? "")) return -1;
      return j;
    }
  }
  return -1;
}

// \$ 写成普通的 $
const unescapeDollar = (text: string) => text.replace(/\\\$/g, "$");

// 切出 $…$ 公式；其余部分原样返回（不处理矩阵）
export function splitMath(text: string): ({ type: "text"; text: string } | { type: "math"; tex: string })[] {
  const out: ({ type: "text"; text: string } | { type: "math"; tex: string })[] = [];
  let last = 0;
  let i = 0;
  const pushText = (end: number) => {
    if (end > last) out.push({ type: "text", text: unescapeDollar(text.slice(last, end)) });
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "\\" && text[i + 1] === "$") {
      i += 2;
      continue;
    }
    if (c === "$" && text[i + 1] !== undefined && !/[\s$]/.test(text[i + 1])) {
      const end = closingDollar(text, i + 1);
      if (end > 0) {
        pushText(i);
        out.push({ type: "math", tex: text.slice(i + 1, end) });
        i = end + 1;
        last = i;
        continue;
      }
    }
    i++;
  }
  pushText(text.length);
  return out;
}

export const hasMath = (text: string) => splitMath(text).some((part) => part.type === "math");

// ---------- 矩阵 ----------
const MATRIX = /\[\s*\[[^[\]]*\](?:\s*,\s*\[[^[\]]*\])*\s*\]/g;
const AUGMENTED = /\[[^[\]|]*\|[^[\]|]*\]/g;
const cells = (row: string) =>
  row
    .split(",")
    .map((cell) => cell.trim())
    .filter((cell) => cell !== "");

// [[1,2],[3,4]] 或增广矩阵 [[1,2|3],[4,5|6]]、[1,2|3]；每个元素不超过 12 个字符、不含空白
export function parseMatrix(source: string): Matrix | null {
  const groups = [...source.matchAll(/\[([^[\]]*)\]/g)].map((match) => match[1]);
  if (!groups.length) return null;
  const rows: string[][] = [];
  let aug = -1;
  for (const group of groups) {
    const halves = group.split("|");
    if (halves.length > 2) return null;
    const left = cells(halves[0]);
    const right = halves.length === 2 ? cells(halves[1]) : [];
    if (halves.length === 2) {
      if (aug >= 0 && aug !== left.length) return null;
      aug = left.length;
    }
    rows.push([...left, ...right]);
  }
  const width = rows[0].length;
  if (!width || rows.some((row) => row.length !== width || row.some((cell) => !/^\S{1,12}$/.test(cell)))) return null;
  return { rows: rows.map((row) => row.map((cell) => cell.replace(/^-/, "−"))), aug };
}

function splitMatrices(text: string): RichPart[] {
  const found: { start: number; end: number; matrix: Matrix; source: string }[] = [];
  for (const regex of [MATRIX, AUGMENTED]) {
    for (const match of text.matchAll(regex)) {
      const start = match.index;
      const end = start + match[0].length;
      if (found.some((item) => start < item.end && end > item.start)) continue;
      const matrix = parseMatrix(match[0]);
      if (matrix) found.push({ start, end, matrix, source: match[0] });
    }
  }
  found.sort((a, b) => a.start - b.start);
  const out: RichPart[] = [];
  let last = 0;
  for (const item of found) {
    if (item.start > last) out.push({ type: "text", text: text.slice(last, item.start) });
    out.push({ type: "matrix", matrix: item.matrix, source: item.source });
    last = item.end;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

// 一段文字 → 文字 / 公式 / 矩阵片段（公式里面不找矩阵）
export function parseRich(text: string): RichPart[] {
  const out: RichPart[] = [];
  for (const part of splitMath(text)) {
    if (part.type === "math") out.push(part);
    else out.push(...splitMatrices(part.text));
  }
  return out;
}

// 公式换成纯文本（解析失败就保留原文）：给朗读、标题、读屏标签、不支持 MathML 的浏览器用
export function stripMath(text: string): string {
  if (!text.includes("$")) return text;
  return splitMath(text)
    .map((part) => {
      if (part.type === "text") return part.text;
      try {
        return texToPlain(part.tex);
      } catch {
        return part.tex;
      }
    })
    .join("");
}
