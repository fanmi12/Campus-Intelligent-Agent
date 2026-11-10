import { splitMath } from "./rich";
import { checkTex, texToPlain } from "./tex";

// 模型写出来的公式什么样的都有：$$…$$、\(…\)、\[…\]、\displaystyle、我们不支持的命令……
// 生成后的清洗把它们整理成页面能渲染的 $…$，实在解析不了的退回成纯文字，保证屏幕上不会出现原始的 LaTeX 源码。

// 解析失败时的保底写法：去掉反斜杠和花括号，命令名当文字留下（\alpha → alpha），总比整段 LaTeX 源码好读
function looseText(tex: string): string {
  return tex
    .replace(/\\(?:left|right|displaystyle|textstyle|mathbf|mathit|operatorname)\b\s*/g, "")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/\\([^A-Za-z])/g, "$1")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 把常见的另外几种公式分隔写法统一成 $…$，并去掉对排版没用的命令
function normalize(text: string): string {
  return text
    .replace(/\$\$([^$]+?)\$\$/g, (_, tex: string) => `$${tex.trim()}$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => `$${tex.trim()}$`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => `$${tex.trim()}$`)
    .replace(/\\(?:displaystyle|textstyle)\b\s*/g, "")
    .replace(/\\(?:dfrac|tfrac)\b/g, "\\frac")
    .replace(/\\(?:leqslant)\b/g, "\\le")
    .replace(/\\(?:geqslant)\b/g, "\\ge");
}

// spoken：讲解词是读出来的，不能有公式：公式一律换成纯文本写法。
// 否则：每个 $…$ 能解析的保留，解析不了的换成纯文字
export function sanitizeMath(text: string, spoken = false): string {
  if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[")) return text;
  const parts = splitMath(normalize(text));
  return parts
    .map((part) => {
      if (part.type === "text") return part.text.replace(/\$/g, spoken ? "" : "\\$");
      const tex = part.tex.trim();
      if (spoken) return checkTex(tex) === null ? texToPlain(tex) : looseText(tex);
      return checkTex(tex) === null ? `$${tex}$` : looseText(tex);
    })
    .join("");
}
