import assert from "node:assert/strict";
import { checkExpr, compileExpr, ExprError, figuresSchema, figureSchema, FIGURE_COLORS } from "../src/lib/learn/figure";

// 讲解页里的图像：表达式求值（含安全性）、每种图的规格、每条逻辑约束都能拦住不合格的输出。

type Parsed = { success: boolean; error?: { issues: { message: string }[] } };
const accepts = (value: unknown, label: string) => {
  const result = figuresSchema.safeParse(value) as Parsed;
  assert.ok(result.success, `${label} 应该通过：${result.error?.issues.map((issue) => issue.message).join("；")}`);
};
const rejects = (value: unknown, message: RegExp, label: string) => {
  const result = figuresSchema.safeParse(value) as Parsed;
  assert.equal(result.success, false, `${label} 应该被拒绝`);
  assert.match(result.error?.issues.map((issue) => issue.message).join("；") ?? "", message, `${label} 的错误信息`);
};

// ---------- 表达式 ----------
const ev = (source: string, vars: Record<string, number> = {}) => compileExpr(source).evaluate(vars);
assert.equal(ev("1+h", { h: 0.5 }), 1.5);
assert.equal(ev("(100-x)/2", { x: 20 }), 40);
assert.equal(ev("x^2", { x: 3 }), 9);
assert.equal(ev("-x^2", { x: 3 }), -9, "负号的优先级低于乘方");
assert.equal(ev("2^3^2"), 512, "乘方右结合");
assert.equal(ev("2*3+4/2-1"), 7);
assert.equal(ev("-(1+2)*3"), -9);
assert.equal(ev("3 * x + 1", { x: 2 }), 7, "空格无所谓");
assert.equal(ev("sqrt(16)"), 4);
assert.equal(ev("abs(-3)"), 3);
assert.ok(Math.abs(ev("sin(pi/2)") - 1) < 1e-12);
assert.ok(Math.abs(ev("ln(e)") - 1) < 1e-12);
assert.ok(Math.abs(ev("exp(0)") - 1) < 1e-12);
assert.equal(ev("100+5*x+0.1*x^2", { x: 10 }), 160);
assert.ok(Number.isNaN(ev("foo(1)")), "未知函数得到 NaN，不报错");
assert.ok(Number.isNaN(ev("y", {})), "未知变量得到 NaN");
assert.ok(Number.isNaN(ev("constructor")), "原型链上的名字不能当变量");
assert.ok(Number.isNaN(ev("toString(1)")), "原型链上的名字不能当函数");
assert.ok(Number.isNaN(ev("__proto__")), "__proto__ 不能当变量");
assert.equal(compileExpr(5).evaluate(), 5, "数字直接返回");
for (const bad of ["1+", "(1", "x y", "", "1+*2", "2 3", "x^", "((("]) assert.throws(() => compileExpr(bad), ExprError, `表达式 ${JSON.stringify(bad)} 应该报错`);
assert.throws(() => compileExpr("1+".repeat(60) + "1"), /太长/);
assert.equal(checkExpr("(100-x)/2"), null);
assert.match(checkExpr("foo(x)") ?? "", /不认识的函数 foo/);
assert.match(checkExpr("k*x") ?? "", /不认识的变量 k/);
assert.equal(checkExpr("k*x", ["k"]), null, "滑块变量可用");
assert.equal(checkExpr("pi*x+e"), null, "常数可用");
assert.match(checkExpr("constructor(1)") ?? "", /不认识的函数/);
assert.match(checkExpr("1+") ?? "", /表达式不对/);

// ---------- 每种图的合法样例 ----------
const plot = { t: "plot", x: [0, 10], y: [0, 10], curves: [{ f: "x^2/10", color: "red" }], pts: [{ x: 5, y: 2.5, label: "P", color: "blue" }], texts: [{ x: 1, y: 9, t: "说明" }], caption: "说明文字" };
accepts([plot], "函数图");
accepts([{ ...plot, param: { name: "h", label: "间隔", min: 0.1, max: 1.5, step: 0.05, value: 1 }, lines: [{ p: [1, 1], q: ["1+h", "(1+h)^2"], dash: "7 5" }], readout: "斜率 $=2+h$ = ⟦2+h⟧" }], "带滑块的函数图");
accepts([{ ...plot, lines: [{ a: 2, b: -1 }, { vx: 3 }, { hy: 4 }, { p: [0, 0], q: [1, 1], ext: false }] }], "四种写法的直线");
accepts([{ t: "plot", x: [-1, 1], y: [-1, 1], polys: [{ pts: [[0, 0], [1, 0], [1, 1]], fill: "blue", stroke: "blue" }], segs: [{ p: [0, 0], q: [1, 1], dash: "5 4" }], arrows: [{ p: [0, 0], q: [1, 0] }] }], "多边形、线段、箭头");
accepts([{ t: "panels", items: [plot, { ...plot, title: "第二张" }] }], "并排小图");
accepts([{ t: "cells", items: ["2", "4", "6", "", ""], idx: true, ptr: [{ i: 2, label: "top = 2" }], hi: [0], dim: [1], mark: [3], sets: [{ name: "集合", idx: [0, 1], color: "blue" }] }], "格子");
accepts([{ t: "ring", n: 5, items: ["F", "", "C", "D", "E"], front: 2, rear: 1, center: "容量 5" }], "环形队列");
accepts([{ t: "tree", nodes: [{ id: "r", x: 10, y: 50, t: "根" }, { id: "a", x: 80, y: 20, t: "叶", fill: "red", stroke: "red" }], edges: [{ a: "r", b: "a", t: "0.6" }] }], "概率树");
accepts([{ t: "bars", rows: [{ label: "总人数", segs: [{ v: 3, label: "甲", color: "red" }, { v: 7, label: "乙", color: "sand" }] }] }], "比例条");
accepts([{ t: "shapes", a: [2, 3], b: [3, 2] }], "矩阵形状");
accepts([{ t: "matmul", A: [[1, 2], [3, 4]], B: [[5, 6], [7, 8]] }], "矩阵乘法");
accepts([], "没有图");
assert.deepEqual([...FIGURE_COLORS].sort(), ["blue", "gold", "gray", "green", "ink", "red", "sand"]);
assert.equal(figureSchema.safeParse({ ...plot, t: "unknown" }).success, false, "未知图类型");

// ---------- 每条约束都能拦住不合格的规格 ----------
rejects([plot, plot, plot, plot], /./, "超过 3 张图");
rejects([{ ...plot, curves: [{ f: "x^2", color: "#ff0000" }] }], /./, "颜色只能用名字");
rejects([{ ...plot, curves: [{ f: "x^2", color: "<script>" }] }], /./, "颜色不能带标签");
rejects([{ ...plot, curves: [{ f: "x^2", dash: "6 4;fill:red" }] }], /虚线写法/, "虚线只能是数字");
rejects([{ ...plot, x: [5, 5] }], /左端必须小于右端/, "区间为空");
rejects([{ ...plot, curves: [{ f: "foo(x)" }] }], /不认识的函数 foo/, "曲线用了未知函数");
rejects([{ ...plot, curves: [{ f: "k*x" }] }], /不认识的变量 k/, "曲线用了没声明的变量");
rejects([{ ...plot, pts: [{ x: "k", y: 1 }] }], /不认识的变量 k/, "坐标用了没声明的变量");
rejects([{ ...plot, curves: [{ f: "x^2+" }] }], /表达式不对/, "表达式语法错");
rejects([{ ...plot, lines: [{ a: 1, vx: 2 }] }], /只能用一种写法/, "直线两种写法混用");
rejects([{ ...plot, lines: [{}] }], /只能用一种写法/, "直线没有写法");
rejects([{ ...plot, lines: [{ p: [0, 0] }] }], /同时给 p 和 q/, "过两点的直线缺 q");
rejects([{ ...plot, lines: [{ b: 1 }] }], /要给 a/, "斜截式缺 a");
rejects([{ ...plot, param: { name: "x", min: 0, max: 1, value: 0.5 } }], /不能是 x/, "滑块变量叫 x");
rejects([{ ...plot, param: { name: "h", min: 0, max: 1, value: 2 } }], /初始值要在/, "滑块初始值越界");
rejects([{ ...plot, readout: "值 ⟦foo(1)⟧" }], /读数里的 不认识的函数 foo/, "读数里的表达式有问题");
rejects([{ ...plot, texts: [{ x: 0, y: 0, t: "" }] }], /./, "空文字");
rejects([{ t: "panels", items: [plot] }], /./, "并排小图至少 2 张");
rejects([{ t: "cells", items: ["1", "2"], hi: [5] }], /格子下标超出范围/, "格子下标越界");
rejects([{ t: "cells", items: ["1", "2"], ptr: [{ i: 3, label: "p" }] }], /格子下标超出范围/, "指针下标越界");
rejects([{ t: "ring", n: 4, items: ["a"], front: 4, rear: 0 }], /超出容量/, "环形队列 front 越界");
rejects([{ t: "ring", n: 3, items: ["a", "b", "c", "d"], front: 0, rear: 0 }], /超出容量/, "环形队列元素太多");
rejects([{ t: "tree", nodes: [{ id: "a", x: 1, y: 1, t: "a" }, { id: "a", x: 2, y: 2, t: "b" }], edges: [{ a: "a", b: "a", t: "1" }] }], /id 不能重复/, "树节点 id 重复");
rejects([{ t: "tree", nodes: [{ id: "a", x: 1, y: 1, t: "a" }, { id: "b", x: 2, y: 2, t: "b" }], edges: [{ a: "a", b: "z", t: "1" }] }], /不存在的节点/, "树连线指向不存在的节点");
rejects([{ t: "matmul", A: [[1, 2]], B: [[1, 2]] }], /A 的列数必须等于 B 的行数/, "矩阵不能相乘");
rejects([{ t: "matmul", A: [[1, 2], [3]], B: [[1], [2]] }], /每行的个数必须一样/, "矩阵行不齐");
rejects([{ t: "shapes", a: [0, 3], b: [3, 2] }], /./, "矩阵形状为 0");
rejects([{ t: "bars", rows: [{ label: "x", segs: [{ v: -1, label: "a", color: "red" }] }] }], /./, "比例条的值为负");

console.log("PASS: expression evaluator (precedence, functions, safety, errors), 12 figure kinds accepted, 30 rejection rules");
