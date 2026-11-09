import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasMath, parseMatrix, parseRich, splitMath, stripMath } from "../src/lib/learn/math/rich";
import { sanitizeMath } from "../src/lib/learn/math/sanitize";
import { checkTex, splitTexAtRelations, texToMathML, texToPlain, TexError } from "../src/lib/learn/math/tex";
import { speakable } from "../src/lib/learn/scene-text";

// 公式与矩阵：LaTeX 子集 → MathML / 纯文本，$…$ 的切分规则，矩阵写法的识别。
// 标准答案（fixtures/learn-math-golden.json）来自第一版转换器，它的输出已在浏览器里逐页核对过。

const golden = JSON.parse(readFileSync(new URL("./fixtures/learn-math-golden.json", import.meta.url), "utf8")) as {
  golden: { tex: string; mathml: string }[];
  errors: [string, string][];
};

// ---------- MathML 输出和标准答案逐字一致 ----------
assert.ok(golden.golden.length >= 40, "标准答案至少 40 个");
for (const { tex, mathml } of golden.golden) assert.equal(texToMathML(tex), mathml, `公式 ${tex} 的 MathML 变了`);
for (const [tex, reason] of golden.errors) {
  assert.throws(() => texToMathML(tex), (error: unknown) => error instanceof TexError && error.message.includes(reason), `${tex} 应该报「${reason}」`);
  assert.ok(checkTex(tex)?.includes(reason), `checkTex(${tex})`);
}
assert.equal(checkTex("\\frac{1}{2}"), null);
assert.throws(() => texToMathML("x".repeat(1001)), /公式太长/);
assert.throws(() => texToMathML("{".repeat(40) + "x" + "}".repeat(40)), /嵌套太深/);

// ---------- 纯文本（不支持 MathML 的浏览器、朗读、标题用） ----------
const plain: [string, string][] = [
  ["x^2", "x²"],
  ["x^{n-1}", "xⁿ⁻¹"],
  ["x^{n+m}", "x^(n+m)"],
  ["e^{ab}", "e^(ab)"],
  ["\\frac{x+1}{x-1}", "(x+1)/(x−1)"],
  ["\\frac{1}{2}", "1/2"],
  ["a_{ik}b_{kj}", "a_(ik)b_(kj)"],
  ["x_0", "x₀"],
  ["f'(x_0)", "f′(x₀)"],
  ["\\sqrt{x^2+1}", "√(x²+1)"],
  ["\\sqrt{2}", "√2"],
  ["\\lim_{h\\to 0} \\frac{f(x_0+h)-f(x_0)}{h}", "lim(h→0)(f(x₀+h)−f(x₀))/h"],
  ["\\sum_{k=1}^{n} a_k", "∑(k=1…n)a_k"],
  ["P(\\text{甲}\\mid D)=0.06\\div 0.14", "P(甲∣D)=0.06÷0.14"],
  ["\\sin x + \\cos^2 x", "sin x+cos²x"],
  ["2\\cdot 3\\times 4", "2·3×4"],
  ["\\alpha + \\Delta x", "α+Δx"],
  ["front==rear", "front==rear"],
];
for (const [tex, expected] of plain) assert.equal(texToPlain(tex), expected, `${tex} 的纯文本写法`);

// ---------- 长公式在等号处拆开，括号里的等号不拆，== 不拆 ----------
assert.deepEqual(splitTexAtRelations("a=b=c"), ["a", "=b", "=c"]);
assert.deepEqual(splitTexAtRelations("f(a=1)+2"), ["f(a=1)+2"]);
assert.deepEqual(splitTexAtRelations("\\left(a=b\\right)=c"), ["\\left(a=b\\right)", "=c"]);
assert.deepEqual(splitTexAtRelations("front==rear"), ["front==rear"]);
assert.deepEqual(splitTexAtRelations("x\\approx 1.5\\ne 2"), ["x", "\\approx 1.5", "\\ne 2"]);
assert.deepEqual(splitTexAtRelations("=x"), ["=x"]);
for (const part of splitTexAtRelations("a=b=c\\approx d")) texToMathML(part);

// ---------- $…$ 的切分 ----------
const kinds = (text: string) => splitMath(text).map((part) => (part.type === "math" ? `$${part.tex}$` : part.text));
assert.deepEqual(kinds("令 $x^2$ 等于 $y$。"), ["令 ", "$x^2$", " 等于 ", "$y$", "。"]);
assert.deepEqual(kinds("$a$$b$"), ["$a$", "$b$"]);
assert.deepEqual(kinds("价格 $5 和 $10"), ["价格 $5 和 $10"], "价格里的 $ 不是公式");
assert.deepEqual(kinds("一共 $5 元"), ["一共 $5 元"], "只有一个 $");
assert.deepEqual(kinds("省 \\$5 或 \\$6"), ["省 $5 或 $6"], "\\$ 写成普通的 $");
assert.deepEqual(kinds("$ x $"), ["$ x $"], "开头结尾有空白的不算公式");
assert.deepEqual(kinds("$x$5"), ["$x$5"], "结尾的 $ 后面紧跟数字的不算公式");
assert.deepEqual(kinds("$a\nb$"), ["$a\nb$"], "公式不跨行");
assert.deepEqual(kinds("没有公式"), ["没有公式"]);
assert.deepEqual(kinds(""), []);
assert.deepEqual(kinds("$a\\$b$"), ["$a\\$b$"], "公式里的 \\$ 保留给转换器");
assert.equal(hasMath("a $b$ c"), true);
assert.equal(hasMath("a $b c"), false);

// ---------- 矩阵 ----------
assert.deepEqual(parseMatrix("[[1,2],[3,4]]"), { rows: [["1", "2"], ["3", "4"]], aug: -1 });
assert.deepEqual(parseMatrix("[[1,-2],[0,3]]"), { rows: [["1", "−2"], ["0", "3"]], aug: -1 }, "负号换成数学减号");
assert.deepEqual(parseMatrix("[[1,2|3],[4,5|6]]"), { rows: [["1", "2", "3"], ["4", "5", "6"]], aug: 2 }, "增广矩阵");
assert.deepEqual(parseMatrix("[1,2|3]"), { rows: [["1", "2", "3"]], aug: 2 }, "增广的一行");
assert.equal(parseMatrix("[[1,2],[3]]"), null, "每行个数要一样");
assert.equal(parseMatrix("[[1 2],[3 4]]"), null, "元素里有空白不算矩阵");
assert.equal(parseMatrix("[[1,2|3],[4|5,6]]"), null, "增广线位置要一致");

const rich = (text: string) => parseRich(text).map((part) => (part.type === "text" ? part.text : part.type === "math" ? `$${part.tex}$` : `<矩阵 ${part.source}>`));
assert.deepEqual(rich("A=[[1,2],[3,4]]，B=[[5,6],[7,8]]"), ["A=", "<矩阵 [[1,2],[3,4]]>", "，B=", "<矩阵 [[5,6],[7,8]]>"]);
assert.deepEqual(rich("增广矩阵 [[1,2|3],[4,5|6]] 化简"), ["增广矩阵 ", "<矩阵 [[1,2|3],[4,5|6]]>", " 化简"]);
assert.deepEqual(rich("行 [0 0 | 0] 说明有矛盾"), ["行 [0 0 | 0] 说明有矛盾"], "带空格的方括号不是矩阵");
assert.deepEqual(rich("令 $A=[[1,2],[3,4]]$ 则"), ["令 ", "$A=[[1,2],[3,4]]$", " 则"], "公式里面不找矩阵");
assert.deepEqual(rich("数组 a[0] 和 b[1][2]"), ["数组 a[0] 和 b[1][2]"], "下标不是矩阵");

// ---------- stripMath 与朗读 ----------
assert.equal(stripMath("斜率是 $\\frac{y_2-y_1}{x_2-x_1}$，不是 $k$。"), "斜率是 (y₂−y₁)/(x₂−x₁)，不是 k。");
assert.equal(stripMath("没有公式 a[0]"), "没有公式 a[0]");
assert.equal(stripMath("坏公式 $\\unknown{x}$ 保留原文"), "坏公式 \\unknown{x} 保留原文");
assert.equal(speakable("得到 $x^2+1$ 再求导 [1]"), "得到 x²+1 再求导");
assert.equal(speakable("先 A -> 再 B"), "先 A，再 B");

// ---------- 生成后的清洗：模型各种写法的公式整理成 $…$ ----------
assert.equal(sanitizeMath("没有公式"), "没有公式");
assert.equal(sanitizeMath("令 $$x^2$$ 再算"), "令 $x^2$ 再算", "$$ 整理成 $");
assert.equal(sanitizeMath("令 \\(x^2\\) 再算"), "令 $x^2$ 再算", "\\( \\) 整理成 $");
assert.equal(sanitizeMath("令 \\[x^2\\] 再算"), "令 $x^2$ 再算", "\\[ \\] 整理成 $");
assert.equal(sanitizeMath("$\\displaystyle\\dfrac{1}{2}$"), "$\\frac{1}{2}$", "去掉 displaystyle，dfrac 换成 frac");
assert.equal(sanitizeMath("坏 $\\foo{x}$ 好"), "坏 foo x 好", "不支持的命令退回成文字");
assert.equal(sanitizeMath("价格 $5 起"), "价格 \\$5 起", "单独的 $ 转义保留");
assert.equal(sanitizeMath("$x$ 和 $y$"), "$x$ 和 $y$", "合格的公式原样");
assert.equal(sanitizeMath("读 $x^2+1$ 然后 $\\frac{1}{2}$", true), "读 x²+1 然后 1/2", "讲解词里的公式换成纯文本");
assert.equal(sanitizeMath("价格 $5 起", true), "价格 5 起", "讲解词里单独的 $ 去掉");
assert.equal(sanitizeMath("矩阵 [[1,2],[3,4]] 不动"), "矩阵 [[1,2],[3,4]] 不动");

console.log(`PASS: ${golden.golden.length} golden formulas, ${plain.length} plain-text forms, relation splitting, $ splitting, matrices, stripMath/speakable`);
