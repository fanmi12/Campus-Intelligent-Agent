import { z } from "zod";

// 讲解页里的图像（函数图、几何示意、数组与队列、概率树、比例条、矩阵演算）：前后端共用，不能 import node: 模块。
// 图像规格是纯数据，页面用 SVG 自己画（见 components/learn/figure/），没有任何依赖。
// 颜色只能用下面这几个名字，不接受任意字符串，规格里不会有能注入页面的内容；函数和坐标写成表达式，用自带的求值器算，不用 eval。

export const FIGURE_COLORS = ["red", "blue", "green", "gold", "gray", "ink", "sand"] as const;
export type FigureColor = (typeof FIGURE_COLORS)[number];

// ---------- 表达式求值 ----------
// 支持 + - * / ^ 和括号，变量 x 与滑块参数，函数 sin cos tan exp ln sqrt abs，常数 pi e
const FUNCTIONS: Record<string, (value: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs };
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const MAX_EXPR = 80;

type Expr =
  | { k: "n"; v: number }
  | { k: "v"; name: string }
  | { k: "neg"; a: Expr }
  | { k: "f"; name: string; a: Expr }
  | { k: "pow"; b: Expr; e: Expr }
  | { k: "+" | "-" | "*" | "/"; l: Expr; r: Expr };

export class ExprError extends Error {}

export type CompiledExpr = {
  evaluate: (vars?: Record<string, number>) => number;
  variables: Set<string>;
  functions: Set<string>;
};

export function compileExpr(source: string | number): CompiledExpr {
  if (typeof source === "number") return { evaluate: () => source, variables: new Set(), functions: new Set() };
  const text = String(source);
  if (text.length > MAX_EXPR) throw new ExprError(`表达式太长：${text.slice(0, 20)}…`);
  const variables = new Set<string>();
  const functions = new Set<string>();
  let i = 0;
  const peek = () => {
    while (text[i] === " ") i++;
    return text[i];
  };
  const bad = (): never => {
    throw new ExprError(`表达式不对：${text}`);
  };
  function primary(): Expr {
    const c = peek();
    if (c === "(") {
      i++;
      const inner = expr();
      if (peek() !== ")") bad();
      i++;
      return inner;
    }
    if (c !== undefined && /[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+/.exec(text.slice(i));
      if (!m) return bad();
      i += m[0].length;
      return { k: "n", v: parseFloat(m[0]) };
    }
    const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(text.slice(i));
    if (!m) return bad();
    i += m[0].length;
    if (peek() === "(") {
      i++;
      const a = expr();
      if (peek() !== ")") bad();
      i++;
      functions.add(m[0]);
      return { k: "f", name: m[0], a };
    }
    variables.add(m[0]);
    return { k: "v", name: m[0] };
  }
  function unary(): Expr {
    const c = peek();
    if (c === "-") {
      i++;
      return { k: "neg", a: unary() };
    }
    if (c === "+") {
      i++;
      return unary();
    }
    return power();
  }
  function power(): Expr {
    const b = primary();
    if (peek() === "^") {
      i++;
      return { k: "pow", b, e: unary() };
    }
    return b;
  }
  function term(): Expr {
    let l = unary();
    for (;;) {
      const c = peek();
      if (c === "*" || c === "/") {
        i++;
        l = { k: c, l, r: unary() };
      } else return l;
    }
  }
  function expr(): Expr {
    let l = term();
    for (;;) {
      const c = peek();
      if (c === "+" || c === "-") {
        i++;
        l = { k: c, l, r: term() };
      } else return l;
    }
  }
  const tree = expr();
  if (peek() !== undefined) bad();
  const run = (node: Expr, vars: Record<string, number>): number => {
    switch (node.k) {
      case "n":
        return node.v;
      case "v":
        return Object.hasOwn(vars, node.name) ? vars[node.name] : Object.hasOwn(CONSTANTS, node.name) ? CONSTANTS[node.name] : NaN;
      case "neg":
        return -run(node.a, vars);
      case "f":
        return Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name](run(node.a, vars)) : NaN;
      case "pow":
        return Math.pow(run(node.b, vars), run(node.e, vars));
      case "+":
        return run(node.l, vars) + run(node.r, vars);
      case "-":
        return run(node.l, vars) - run(node.r, vars);
      case "*":
        return run(node.l, vars) * run(node.r, vars);
      case "/":
        return run(node.l, vars) / run(node.r, vars);
    }
  };
  return { evaluate: (vars = {}) => run(tree, vars), variables, functions };
}

// 表达式有没有语法错误、有没有用到未知的函数或变量；allowed 是除 x 和常数外允许出现的变量名（滑块参数）
export function checkExpr(source: string, allowed: string[] = []): string | null {
  try {
    const { variables, functions } = compileExpr(source);
    for (const name of functions) if (!Object.hasOwn(FUNCTIONS, name)) return `不认识的函数 ${name}`;
    for (const name of variables) if (name !== "x" && !Object.hasOwn(CONSTANTS, name) && !allowed.includes(name)) return `不认识的变量 ${name}`;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// ---------- 规格 ----------
const finite = z.number().finite().min(-1_000_000).max(1_000_000);
const expression = z.string().trim().min(1).max(MAX_EXPR);
// 坐标：数字，或者含滑块参数的表达式（如 "1+h"）
const coord = z.union([finite, expression]);
const point = z.tuple([coord, coord]);
const range = z.tuple([finite, finite]).refine(([a, b]) => a < b, "区间的左端必须小于右端");
const color = z.enum(FIGURE_COLORS);
const dash = z.string().regex(/^\d{1,2}( \d{1,2}){0,3}$/, "虚线写法如 6 4");
const caption = z.string().trim().min(1).max(300);
const title = z.string().trim().min(1).max(60);
const label = z.string().trim().min(1).max(40);
const offset = z.number().min(-200).max(200);
const anchor = z.enum(["start", "middle", "end"]);
const stroke = z.number().min(0.5).max(10);

export const plotSpecSchema = z.object({
  x: range,
  y: range,
  tx: z.number().positive().max(1_000_000).optional(),
  ty: z.number().positive().max(1_000_000).optional(),
  xl: z.string().trim().min(1).max(16).optional(),
  yl: z.string().trim().min(1).max(16).optional(),
  w: z.number().min(200).max(800).optional(),
  h: z.number().min(160).max(600).optional(),
  curves: z.array(z.object({ f: expression, x: range.optional(), color: color.optional(), w: stroke.optional(), dash: dash.optional() })).max(6).optional(),
  // 直线四种写法选一种：斜截式 a、b；竖线 vx；横线 hy；过两点 p、q（ext 为 false 时只画线段）
  lines: z
    .array(
      z.object({
        a: coord.optional(),
        b: coord.optional(),
        vx: coord.optional(),
        hy: coord.optional(),
        p: point.optional(),
        q: point.optional(),
        ext: z.boolean().optional(),
        color: color.optional(),
        w: stroke.optional(),
        dash: dash.optional(),
      }),
    )
    .max(8)
    .optional(),
  segs: z.array(z.object({ p: point, q: point, color: color.optional(), w: stroke.optional(), dash: dash.optional() })).max(10).optional(),
  arrows: z.array(z.object({ p: point, q: point, color: color.optional(), w: stroke.optional(), dash: dash.optional() })).max(6).optional(),
  polys: z.array(z.object({ pts: z.array(point).min(3).max(8), fill: color.optional(), stroke: color.optional(), w: stroke.optional(), dash: dash.optional() })).max(4).optional(),
  pts: z
    .array(z.object({ x: coord, y: coord, color: color.optional(), r: z.number().min(2).max(10).optional(), label: label.optional(), dx: offset.optional(), dy: offset.optional(), anchor: anchor.optional() }))
    .max(8)
    .optional(),
  texts: z
    .array(z.object({ x: coord, y: coord, t: label, color: color.optional(), size: z.number().min(9).max(20).optional(), weight: z.number().min(400).max(800).optional(), dx: offset.optional(), dy: offset.optional(), anchor: anchor.optional() }))
    .max(8)
    .optional(),
  // 滑块：变量名是一个小写字母（不能是 x），曲线、坐标和读数里可以用它
  param: z
    .object({
      name: z.string().regex(/^[a-wyz]$/, "滑块变量必须是单个小写字母，且不能是 x"),
      label: z.string().trim().min(1).max(12).optional(),
      min: finite,
      max: finite,
      step: z.number().positive().max(1000).optional(),
      value: finite,
    })
    .refine((param) => param.min < param.max && param.value >= param.min && param.value <= param.max, "滑块的初始值要在最小值和最大值之间")
    .optional(),
  // 滑块下方的读数；⟦表达式⟧ 会换成当前的计算结果，$…$ 是公式
  readout: z.string().trim().min(1).max(200).optional(),
});
export type PlotSpec = z.infer<typeof plotSpecSchema>;

const plotWithTitle = plotSpecSchema.extend({ title: title.optional() });

const cellsSchema = z.object({
  t: z.literal("cells"),
  title: title.optional(),
  caption: caption.optional(),
  items: z.array(z.string().trim().max(6)).min(1).max(12),
  cw: z.number().min(30).max(120).optional(),
  ch: z.number().min(30).max(80).optional(),
  idx: z.boolean().optional(),
  mark: z.array(z.number().int().min(0).max(11)).max(12).optional(),
  hi: z.array(z.number().int().min(0).max(11)).max(12).optional(),
  dim: z.array(z.number().int().min(0).max(11)).max(12).optional(),
  ptr: z.array(z.object({ i: z.number().int().min(0).max(11), label, color: color.optional(), pos: z.enum(["above", "below"]).optional() })).max(4).optional(),
  sets: z.array(z.object({ name: label, idx: z.array(z.number().int().min(0).max(11)).min(1).max(12), color })).max(3).optional(),
});

export const figureSchema = z.discriminatedUnion("t", [
  plotSpecSchema.extend({ t: z.literal("plot"), title: title.optional(), caption: caption.optional() }),
  z.object({ t: z.literal("panels"), caption: caption.optional(), items: z.array(plotWithTitle).min(2).max(3) }),
  cellsSchema,
  z.object({
    t: z.literal("ring"),
    caption: caption.optional(),
    n: z.number().int().min(3).max(12),
    items: z.array(z.string().trim().max(4)).max(12),
    front: z.number().int().min(0).max(11),
    rear: z.number().int().min(0).max(11),
    center: z.string().trim().min(1).max(12).optional(),
  }),
  z.object({
    t: z.literal("tree"),
    caption: caption.optional(),
    h: z.number().min(160).max(420).optional(),
    nodes: z
      .array(z.object({ id: z.string().regex(/^[a-z0-9]{1,6}$/), x: z.number().min(0).max(100), y: z.number().min(0).max(100), t: label, w: z.number().min(40).max(160).optional(), fill: color.optional(), stroke: color.optional(), color: color.optional() }))
      .min(2)
      .max(16),
    edges: z.array(z.object({ a: z.string(), b: z.string(), t: z.string().trim().min(1).max(8) })).min(1).max(20),
  }),
  z.object({
    t: z.literal("bars"),
    caption: caption.optional(),
    rows: z
      .array(z.object({ label: z.string().trim().min(1).max(60), segs: z.array(z.object({ v: z.number().min(0).max(1_000_000_000), label, color })).min(1).max(5) }))
      .min(1)
      .max(4),
  }),
  z.object({
    t: z.literal("shapes"),
    caption: caption.optional(),
    a: z.tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)]),
    b: z.tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)]),
  }),
  z.object({
    t: z.literal("matmul"),
    title: title.optional(),
    caption: caption.optional(),
    A: z.array(z.array(finite).min(1).max(4)).min(1).max(4),
    B: z.array(z.array(finite).min(1).max(4)).min(1).max(4),
  }),
]);
export type Figure = z.infer<typeof figureSchema>;
export type PlotFigure = Extract<Figure, { t: "plot" }>;
export type PanelsFigure = Extract<Figure, { t: "panels" }>;

export const MAX_FIGURES = 3;

// 一页里的图像列表，附带逻辑检查（表达式能不能算、直线写法对不对、矩阵能不能相乘…）
export const figuresSchema = z
  .array(figureSchema)
  .max(MAX_FIGURES)
  .superRefine((figures, ctx) => {
    const issue = (index: number, message: string) => ctx.addIssue({ code: "custom", path: [index], message });
    figures.forEach((figure, index) => {
      if (figure.t === "plot" || figure.t === "panels") {
        const specs: PlotSpec[] = figure.t === "plot" ? [figure] : figure.items;
        for (const spec of specs) {
          const allowed = spec.param ? [spec.param.name] : [];
          const exprs: string[] = [];
          for (const curve of spec.curves ?? []) exprs.push(curve.f);
          const coords = (values: (string | number)[]) => exprs.push(...values.filter((value): value is string => typeof value === "string"));
          for (const line of spec.lines ?? []) {
            const forms = [line.a !== undefined || line.b !== undefined, line.vx !== undefined, line.hy !== undefined, line.p !== undefined || line.q !== undefined].filter(Boolean).length;
            if (forms !== 1) issue(index, "每条直线只能用一种写法：a 和 b、vx、hy，或 p 和 q");
            else if ((line.p === undefined) !== (line.q === undefined)) issue(index, "过两点的直线要同时给 p 和 q");
            else if (line.a === undefined && line.b !== undefined) issue(index, "斜截式的直线要给 a");
            coords([line.a ?? 0, line.b ?? 0, line.vx ?? 0, line.hy ?? 0, ...(line.p ?? []), ...(line.q ?? [])]);
          }
          for (const item of [...(spec.segs ?? []), ...(spec.arrows ?? [])]) coords([...item.p, ...item.q]);
          for (const poly of spec.polys ?? []) coords(poly.pts.flat());
          for (const item of spec.pts ?? []) coords([item.x, item.y]);
          for (const item of spec.texts ?? []) coords([item.x, item.y]);
          for (const source of exprs) {
            const problem = checkExpr(source, allowed);
            if (problem) issue(index, problem);
          }
          if (spec.readout) {
            for (const match of spec.readout.matchAll(/⟦([^⟧]+)⟧/g)) {
              const problem = checkExpr(match[1], allowed);
              if (problem) issue(index, `读数里的 ${problem}`);
            }
          }
        }
      }
      if (figure.t === "cells") {
        const size = figure.items.length;
        for (const list of [figure.mark, figure.hi, figure.dim, ...(figure.sets ?? []).map((set) => set.idx), ...(figure.ptr ?? []).map((ptr) => [ptr.i])]) {
          if (list?.some((position) => position >= size)) issue(index, "格子下标超出范围");
        }
      }
      if (figure.t === "ring") {
        if (figure.front >= figure.n || figure.rear >= figure.n || figure.items.length > figure.n) issue(index, "环形队列的下标或元素个数超出容量");
      }
      if (figure.t === "tree") {
        const ids = new Set(figure.nodes.map((node) => node.id));
        if (ids.size !== figure.nodes.length) issue(index, "树的节点 id 不能重复");
        if (figure.edges.some((edge) => !ids.has(edge.a) || !ids.has(edge.b))) issue(index, "树的连线指向了不存在的节点");
      }
      if (figure.t === "matmul") {
        const same = (matrix: number[][]) => matrix.every((row) => row.length === matrix[0].length);
        if (!same(figure.A) || !same(figure.B)) issue(index, "矩阵每行的个数必须一样");
        else if (figure.A[0].length !== figure.B.length) issue(index, "A 的列数必须等于 B 的行数才能相乘");
      }
    });
  });

// 讲解页内容 = 生成时的内容 + 可选的图像
export const slideFiguresSchema = figuresSchema.optional();
