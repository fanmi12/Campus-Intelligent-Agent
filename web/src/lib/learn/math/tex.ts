// LaTeX 子集 → MathML / 纯文本。前后端共用，不依赖任何库（不能 import node: 模块）。
//
// 课程里的公式写成 $…$ 包住的 LaTeX 子集，浏览器用原生 MathML 排版（Chrome 109+、Safari、Firefox 都支持）。
// 支持：\frac \sqrt \overline \vec \text \mathrm \left…\right ^ _ ' \lim \sum \prod \int、sin cos tan ln log exp max min det 等函数名、
// 常用符号和希腊字母。不认识的命令会抛 TexError（带位置），生成内容时据此把不合格的公式退回成纯文字，不会悄悄吞掉。
//
// 做法：先解析成语法树，再分别输出 MathML（texToMathML）和纯文本（texToPlain，给不支持 MathML 的浏览器、朗读、标题等用）。

export class TexError extends Error {}

type Node =
  | { t: "mn"; v: string }
  | { t: "mi"; v: string; normal?: boolean; limits?: boolean }
  | { t: "fn"; v: string } // sin cos 等函数名，后面跟「函数作用」符号
  | { t: "mo"; v: string; attrs?: string; limits?: boolean }
  | { t: "mtext"; v: string }
  | { t: "mspace"; w: string }
  | { t: "row"; c: Node[] }
  | { t: "frac"; a: Node; b: Node }
  | { t: "sqrt"; a: Node }
  | { t: "accent"; a: Node; kind: "bar" | "vec" }
  | { t: "fenced"; l: string; r: string; c: Node[]; tall: boolean }
  | { t: "sub"; base: Node; sub: Node }
  | { t: "sup"; base: Node; sup: Node }
  | { t: "subsup"; base: Node; sub: Node; sup: Node }
  | { t: "under"; base: Node; under: Node }
  | { t: "over"; base: Node; over: Node }
  | { t: "underover"; base: Node; under: Node; over: Node };

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", varepsilon: "ε", theta: "θ", lambda: "λ", mu: "μ",
  pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ", phi: "φ", omega: "ω", Omega: "Ω",
};
const SYMS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", ne: "≠", neq: "≠", le: "≤", leq: "≤", ge: "≥", geq: "≥", approx: "≈", to: "→",
  rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", infty: "∞", in: "∈", mid: "∣", ldots: "…", cdots: "⋯", prime: "′", sim: "∼",
  propto: "∝", cap: "∩", cup: "∪", subset: "⊂", land: "∧", lor: "∨",
};
const FUNCS = new Set(["sin", "cos", "tan", "ln", "log", "exp", "max", "min", "det", "lim", "arcsin", "arccos", "arctan"]);
const MAX_LENGTH = 1000;
const MAX_DEPTH = 24;

// ---------- 解析 ----------
function parse(source: string): Node[] {
  const src = String(source);
  if (src.length > MAX_LENGTH) throw new TexError("公式太长");
  let i = 0;
  let depth = 0;
  const fail = (message: string): never => {
    throw new TexError(`${message}：…${src.slice(Math.max(0, i - 14), i + 14)}…`);
  };
  const skip = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  // 普通括号、竖线不要自动拉伸（LaTeX 里只有 \left…\right 才会拉伸），否则 f(x₀) 的括号会被下标撑得很高
  const mo = (v: string, attrs?: string): Node => ({ t: "mo", v, attrs: attrs ?? ("()[]{}|".includes(v) ? ' stretchy="false"' : undefined) });

  function readCommand(): string {
    i++; // 跳过反斜杠
    const m = /^[A-Za-z]+/.exec(src.slice(i));
    if (m) {
      i += m[0].length;
      return m[0];
    }
    const c = src[i++];
    if (c === undefined) fail("反斜杠后面没有内容");
    return c;
  }
  // 读 {…} 里的原始文字（\text 用），支持嵌套花括号
  function rawGroup(): string {
    skip();
    if (src[i] !== "{") fail("缺少 {");
    let level = 0;
    const start = i + 1;
    for (; i < src.length; i++) {
      if (src[i] === "{") level++;
      else if (src[i] === "}") {
        level--;
        if (!level) {
          const text = src.slice(start, i);
          i++;
          return text;
        }
      }
    }
    return fail("缺少 }");
  }
  function group(): Node {
    const c = seq(true);
    if (src[i] !== "}") fail("缺少 }");
    i++;
    return { t: "row", c };
  }
  function arg(): Node {
    skip();
    if (src[i] === "{") {
      i++;
      return group();
    }
    const a = atom();
    if (!a) return fail("缺少参数");
    return a.node;
  }
  function delim(): string {
    skip();
    const c = src[i];
    if (c === undefined) fail("缺少分隔符");
    if (c === "\\") {
      const name = readCommand();
      const map: Record<string, string> = { "{": "{", "}": "}", "|": "‖", langle: "⟨", rangle: "⟩" };
      return map[name] ?? fail(`不支持的分隔符 \\${name}`);
    }
    i++;
    return c === "." ? "" : c;
  }

  // 一个原子：返回节点，limits 表示上下标要放在上下方（\sum、\lim）；单独出现的 ' ^ _ 返回 empty 交给 scripts 处理
  type Atom = { node: Node; limits?: boolean; empty?: boolean };
  function atom(): Atom | null {
    skip();
    if (i >= src.length) return null;
    const c = src[i];
    if (c === "{") {
      i++;
      return { node: group() };
    }
    if (c === "\\") {
      const name = readCommand();
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const a = arg();
        const b = arg();
        return { node: { t: "frac", a, b } };
      }
      if (name === "sqrt") return { node: { t: "sqrt", a: arg() } };
      if (name === "overline") return { node: { t: "accent", a: arg(), kind: "bar" } };
      if (name === "vec") return { node: { t: "accent", a: arg(), kind: "vec" } };
      if (name === "text") return { node: { t: "mtext", v: rawGroup() } };
      if (name === "mathrm") return { node: { t: "mi", v: rawGroup(), normal: true } };
      if (name === "left") {
        const l = delim();
        const c2 = seq(false);
        if (!src.startsWith("\\right", i)) fail("\\left 缺少 \\right");
        i += 6;
        const r = delim();
        // 只有内容真的很高（分式、根号、上下限、矩阵）才拉伸括号；x₀ 这类小内容用普通括号，否则括号会显得过大
        return { node: { t: "fenced", l, r, c: c2, tall: c2.some(isTall) } };
      }
      if (name === "sum") return { node: { t: "mo", v: "∑", attrs: ' largeop="true" movablelimits="true"' }, limits: true };
      if (name === "prod") return { node: { t: "mo", v: "∏", attrs: ' largeop="true" movablelimits="true"' }, limits: true };
      if (name === "int") return { node: { t: "mo", v: "∫", attrs: ' largeop="true"' } };
      if (name === "lim" || name === "max" || name === "min") return { node: { t: "mi", v: name }, limits: true };
      if (FUNCS.has(name)) return { node: { t: "fn", v: name } };
      if (GREEK[name]) return { node: { t: "mi", v: GREEK[name] } };
      if (SYMS[name]) return { node: mo(SYMS[name]) };
      if (name === ",") return { node: { t: "mspace", w: "0.17em" } };
      if (name === ";" || name === " ") return { node: { t: "mspace", w: "0.28em" } };
      if (name === "quad") return { node: { t: "mspace", w: "1em" } };
      if (name === "{" || name === "}") return { node: mo(name) };
      if (name === "%") return { node: mo("%") };
      return fail(`不支持的命令 \\${name}`);
    }
    if (c === "}") return null;
    const digits = /^[0-9]+(?:\.[0-9]+)?/.exec(src.slice(i));
    if (digits) {
      i += digits[0].length;
      return { node: { t: "mn", v: digits[0] } };
    }
    if (/[A-Za-z]/.test(c) || /[α-ωΑ-Ω]/.test(c)) {
      i++;
      return { node: { t: "mi", v: c } };
    }
    if (/[一-鿿]/.test(c)) {
      i++;
      return { node: { t: "mtext", v: c } };
    }
    if (src.startsWith("==", i) || src.startsWith("!=", i)) {
      // 代码里的 == 和 != 当作一个运算符
      const two = src.slice(i, i + 2);
      i += 2;
      return { node: mo(two) };
    }
    if ("+=<>()[],;:!/|*.%?".includes(c)) {
      i++;
      return { node: mo(c) };
    }
    if (c === "-") {
      i++;
      return { node: mo("−") };
    }
    if (c === "~") {
      i++;
      return { node: { t: "mspace", w: "0.25em" } };
    }
    if (c === "'" || c === "^" || c === "_") return { node: { t: "row", c: [] }, empty: true };
    if (/[←-⋿°-ÿ′-‴·×÷±]/.test(c)) {
      i++;
      return { node: mo(c) };
    }
    return fail(`不支持的字符 ${c}`);
  }

  function withScripts(base: Node, limits = false): Node {
    let sub: Node | undefined;
    let sup: Node | undefined;
    let primes = 0;
    for (;;) {
      skip();
      const c = src[i];
      if (c === "_") {
        i++;
        sub = arg();
      } else if (c === "^") {
        i++;
        sup = arg();
      } else if (c === "'") {
        i++;
        primes++;
      } else break;
    }
    if (primes) {
      const prime: Node = { t: "mo", v: primes === 1 ? "′" : primes === 2 ? "″" : "‴" };
      sup = sup ? { t: "row", c: [prime, sup] } : prime;
    }
    if (!sub && !sup) return base;
    if (limits) {
      if (sub && sup) return { t: "underover", base, under: sub, over: sup };
      return sub ? { t: "under", base, under: sub } : { t: "over", base, over: sup! };
    }
    if (sub && sup) return { t: "subsup", base, sub, sup };
    return sub ? { t: "sub", base, sub } : { t: "sup", base, sup: sup! };
  }

  function seq(inGroup: boolean): Node[] {
    if (++depth > MAX_DEPTH) fail("公式嵌套太深");
    const out: Node[] = [];
    for (;;) {
      skip();
      if (i >= src.length) break;
      if (src[i] === "}") {
        if (inGroup) break;
        fail("多余的 }");
      }
      if (src.startsWith("\\right", i)) break;
      const a = atom();
      if (a === null) break;
      if (a.empty) {
        // 单独出现的上标、下标、撇号：以空内容为底
        out.push(withScripts({ t: "row", c: [] }));
        continue;
      }
      out.push(withScripts(a.node, a.limits));
    }
    depth--;
    return out;
  }

  const body = seq(false);
  if (i < src.length) fail("公式没有读完");
  return body;
}

function isTall(node: Node): boolean {
  switch (node.t) {
    case "frac":
    case "sqrt":
    case "accent":
    case "under":
    case "over":
    case "underover":
      return true;
    case "row":
      return node.c.some(isTall);
    case "fenced":
      return node.c.some(isTall);
    case "sub":
      return isTall(node.base) || isTall(node.sub);
    case "sup":
      return isTall(node.base) || isTall(node.sup);
    case "subsup":
      return isTall(node.base) || isTall(node.sub) || isTall(node.sup);
    default:
      return false;
  }
}

// ---------- MathML ----------
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function mathml(node: Node): string {
  switch (node.t) {
    case "mn":
      return `<mn>${node.v}</mn>`;
    case "mi":
      return node.normal ? `<mi mathvariant="normal">${esc(node.v)}</mi>` : `<mi>${esc(node.v)}</mi>`;
    case "fn":
      return `<mi>${node.v}</mi><mo>&#x2061;</mo>`;
    case "mo":
      return `<mo${node.attrs ?? ""}>${esc(node.v)}</mo>`;
    case "mtext":
      return `<mtext>${esc(node.v)}</mtext>`;
    case "mspace":
      return `<mspace width="${node.w}"></mspace>`;
    case "row":
      return `<mrow>${node.c.map(mathml).join("")}</mrow>`;
    case "frac":
      return `<mfrac>${mathml(node.a)}${mathml(node.b)}</mfrac>`;
    case "sqrt":
      return `<msqrt>${mathml(node.a)}</msqrt>`;
    case "accent":
      return node.kind === "bar" ? `<mover>${mathml(node.a)}<mo>‾</mo></mover>` : `<mover accent="true">${mathml(node.a)}<mo>→</mo></mover>`;
    case "fenced": {
      const fence = node.tall ? ' fence="true" stretchy="true"' : ' fence="true" stretchy="false"';
      const open = node.l ? `<mo${fence}>${esc(node.l)}</mo>` : "";
      const close = node.r ? `<mo${fence}>${esc(node.r)}</mo>` : "";
      return `<mrow>${open}${node.c.map(mathml).join("")}${close}</mrow>`;
    }
    case "sub":
      return `<msub>${mathml(node.base)}${mathml(node.sub)}</msub>`;
    case "sup":
      return `<msup>${mathml(node.base)}${mathml(node.sup)}</msup>`;
    case "subsup":
      return `<msubsup>${mathml(node.base)}${mathml(node.sub)}${mathml(node.sup)}</msubsup>`;
    case "under":
      return `<munder>${mathml(node.base)}${mathml(node.under)}</munder>`;
    case "over":
      return `<mover>${mathml(node.base)}${mathml(node.over)}</mover>`;
    case "underover":
      return `<munderover>${mathml(node.base)}${mathml(node.under)}${mathml(node.over)}</munderover>`;
  }
}

export function texToMathML(source: string): string {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>${parse(source).map(mathml).join("")}</mrow></math>`;
}

// ---------- 纯文本 ----------
const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "−": "⁻", "-": "⁻", n: "ⁿ", i: "ⁱ" };
const SUBSCRIPT: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };

const mapChars = (text: string, table: Record<string, string>): string | null => {
  let out = "";
  for (const ch of text) {
    const mapped = table[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
};
// 只有字母、数字、上下标字符的算「一个整体」，分式、根号里不用再加括号
const isSimple = (text: string) => /^[\p{L}\p{N}.′″‴⁰-⁹₀-₉ⁿⁱ]+$/u.test(text);
const wrap = (text: string) => (isSimple(text) ? text : `(${text})`);

function plainList(nodes: Node[]): string {
  let out = "";
  nodes.forEach((node, index) => {
    const text = plain(node);
    // sin x、lim h：函数名后面紧跟字母或数字时留一个空格
    const previous = nodes[index - 1];
    if (previous && (previous.t === "fn" || (previous.t === "mi" && previous.limits)) && /^[\p{L}\p{N}]/u.test(text)) out += " ";
    out += text;
  });
  return out;
}

function plain(node: Node): string {
  switch (node.t) {
    case "mn":
    case "mi":
    case "fn":
    case "mo":
    case "mtext":
      return node.v;
    case "mspace":
      return parseFloat(node.w) >= 0.25 ? " " : "";
    case "row":
      return plainList(node.c);
    case "frac":
      return `${wrap(plain(node.a))}/${wrap(plain(node.b))}`;
    case "sqrt":
      return `√${wrap(plain(node.a))}`;
    case "accent": {
      const inner = plain(node.a);
      return node.kind === "bar" ? [...inner].map((ch) => `${ch}̅`).join("") : `${inner}⃗`;
    }
    case "fenced":
      return `${node.l}${plainList(node.c)}${node.r}`;
    case "sub":
    case "subsup": {
      const base = plain(node.base);
      const small = plain(node.sub);
      const lower = mapChars(small, SUBSCRIPT) ?? (/^[\p{L}\p{N}]$/u.test(small) ? `_${small}` : `_(${small})`);
      const upper = node.t === "subsup" ? supText(plain(node.sup)) : "";
      return `${base}${lower}${upper}`;
    }
    case "sup":
      return `${plain(node.base)}${supText(plain(node.sup))}`;
    case "under":
      return `${plain(node.base)}(${plain(node.under)})`;
    case "over":
      return `${plain(node.base)}^(${plain(node.over)})`;
    case "underover":
      return `${plain(node.base)}(${plain(node.under)}…${plain(node.over)})`;
  }
}

function supText(text: string): string {
  if (/^[′″‴]+$/.test(text)) return text;
  return mapChars(text, SUPERSCRIPT) ?? (/^[\p{L}\p{N}]$/u.test(text) ? `^${text}` : `^(${text})`);
}

export function texToPlain(source: string): string {
  return plainList(parse(source));
}

// 公式能不能被解析；不能就返回原因
export function checkTex(source: string): string | null {
  try {
    parse(source);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// 长公式在窄处（手机、闪卡）放不下：按最外层的 = ≈ ≠ ≤ ≥ 拆成几段，每段单独排版，中间留一个可换行的空格
export function splitTexAtRelations(src: string): string[] {
  const parts: string[] = [];
  let level = 0;
  let start = 0;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (src.startsWith("\\left", i)) {
      level++;
      i += 5;
      continue;
    }
    if (src.startsWith("\\right", i)) {
      level--;
      i += 6;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") level++;
    else if (c === "}" || c === ")" || c === "]") level--;
    else if (level === 0 && i > start) {
      const rel = c === "=" ? 1 : /^\\(?:approx|neq?|le|ge|leq|geq)(?![A-Za-z])/.exec(src.slice(i))?.[0].length;
      if (rel && !(c === "=" && (src[i + 1] === "=" || src[i - 1] === "="))) {
        if (src.slice(start, i).trim()) parts.push(src.slice(start, i));
        start = i;
        i += rel;
        continue;
      }
    }
    i++;
  }
  parts.push(src.slice(start));
  return parts;
}
