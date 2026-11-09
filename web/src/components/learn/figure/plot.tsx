"use client";

import { useId, useMemo, useState } from "react";
import { compileExpr, type CompiledExpr, type FigureColor, type PanelsFigure, type PlotFigure, type PlotSpec } from "@/lib/learn/figure";
import { RichText } from "../source-badges";
import styles from "./figure.module.css";
import { choosePlacement, labelBox, type Box, type Placement } from "./labels";
import { Arrow, ArrowHead, AXIS, COLOR, GRID, MUTED, niceStep, num, tint, Txt } from "./svg";

// 函数图 / 坐标图：曲线、直线、线段、箭头、多边形、点和文字，可以带一个滑块（曲线、坐标和读数里用同一个变量）。
// 全部用 SVG 自己画。坐标和函数写成表达式，用 lib/learn/figure.ts 里自带的求值器算。

type Vars = Record<string, number>;
type Coord = number | string;

const compiled = new Map<string, CompiledExpr | null>();
function compile(source: string): CompiledExpr | null {
  const hit = compiled.get(source);
  if (hit !== undefined) return hit;
  let result: CompiledExpr | null = null;
  try {
    result = compileExpr(source);
  } catch {
    result = null;
  }
  if (compiled.size > 500) compiled.clear();
  compiled.set(source, result);
  return result;
}

const SAMPLES = 260;
const pick = (color: FigureColor | undefined, fallback: FigureColor) => COLOR[color ?? fallback];

export function PlotSvg({ spec, vars, label }: { spec: PlotSpec; vars: Vars; label?: string }) {
  const clipId = `clip${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const [x0, x1] = spec.x;
  const [y0, y1] = spec.y;
  const W = spec.w ?? 520;
  const H = spec.h ?? 330;
  const ml = 42;
  const mr = 16;
  // 纵轴名称放在绘图区上沿之外；横轴贴着绘图区下沿时，横轴名称放在刻度数字下面，所以要多留边
  const mt = spec.yl ? 24 : 14;
  const mb = spec.xl && y0 >= 0 ? 44 : 34;
  const X = (x: number) => ml + ((x - x0) / (x1 - x0)) * (W - ml - mr);
  const Y = (y: number) => H - mb - ((y - y0) / (y1 - y0)) * (H - mt - mb);
  const sx = spec.tx || niceStep(x1 - x0);
  const sy = spec.ty || niceStep(y1 - y0);
  const ax = x0 <= 0 && 0 <= x1 ? 0 : x0;
  const ay = y0 <= 0 && 0 <= y1 ? 0 : y0;
  const ev = (value: Coord): number => (typeof value === "number" ? value : (compile(value)?.evaluate(vars) ?? NaN));

  const xTicks: number[] = [];
  for (let x = Math.ceil(x0 / sx - 1e-9) * sx; x <= x1 + 1e-9; x += sx) xTicks.push(x);
  const yTicks: number[] = [];
  for (let y = Math.ceil(y0 / sy - 1e-9) * sy; y <= y1 + 1e-9; y += sy) yTicks.push(y);

  // 直线的两个端点（延长到绘图区外，由裁剪框截断）
  const lineEnds = (line: NonNullable<PlotSpec["lines"]>[number]): [number, number, number, number] | null => {
    let e: [number, number, number, number];
    if (line.vx !== undefined) {
      const c = ev(line.vx);
      e = [c, y0, c, y1];
    } else if (line.hy !== undefined) {
      const c = ev(line.hy);
      e = [x0, c, x1, c];
    } else if (line.a !== undefined) {
      const a = ev(line.a);
      const b = line.b === undefined ? 0 : ev(line.b);
      e = [x0 - 1, a * (x0 - 1) + b, x1 + 1, a * (x1 + 1) + b];
    } else if (line.p && line.q) {
      const [px, py] = [ev(line.p[0]), ev(line.p[1])];
      const [qx, qy] = [ev(line.q[0]), ev(line.q[1])];
      if (line.ext === false) e = [px, py, qx, qy];
      else if (Math.abs(qx - px) < 1e-9) e = [px, y0, px, y1];
      else {
        const a = (qy - py) / (qx - px);
        const b = py - a * px;
        e = [x0 - 1, a * (x0 - 1) + b, x1 + 1, a * (x1 + 1) + b];
      }
    } else return null;
    return e.every(Number.isFinite) ? e : null;
  };

  const sampleCurve = (f: CompiledExpr, a: number, b: number): { d: string; pts: [number, number][] } => {
    let d = "";
    let pen = false;
    const pts: [number, number][] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const x = a + ((b - a) * k) / SAMPLES;
      const y = f.evaluate({ ...vars, x });
      if (!Number.isFinite(y) || Math.abs(y) > 1e6) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`;
      pts.push([X(x), Y(y)]);
      pen = true;
    }
    return { d, pts };
  };

  const finite = (...values: number[]) => values.every(Number.isFinite);

  // 曲线只算一次：画线和给点的名字避让都要用
  const curves = (spec.curves ?? []).map((curve) => {
    const f = compile(curve.f);
    const [a, b] = curve.x ?? [x0, x1];
    return f ? sampleCurve(f, a, b) : null;
  });

  // 点的名字：没指定位置的在候选位置里挑一个不压曲线、不压别的字的；指定了位置的原样用（精选课程手工调过）
  const bounds = { x0: ml, x1: W - mr, y0: mt, y1: H - mb };
  const obstacles: [number, number][] = curves.flatMap((curve) => curve?.pts ?? []);
  const along = (x1p: number, y1p: number, x2p: number, y2p: number) => {
    for (let k = 0; k <= 40; k++) obstacles.push([x1p + ((x2p - x1p) * k) / 40, y1p + ((y2p - y1p) * k) / 40]);
  };
  for (const line of spec.lines ?? []) {
    const e = lineEnds(line);
    if (e) along(X(e[0]), Y(e[1]), X(e[2]), Y(e[3]));
  }
  for (const seg of [...(spec.segs ?? []), ...(spec.arrows ?? [])]) {
    const [px, py, qx, qy] = [ev(seg.p[0]), ev(seg.p[1]), ev(seg.q[0]), ev(seg.q[1])];
    if (finite(px, py, qx, qy)) along(X(px), Y(py), X(qx), Y(qy));
  }
  const boxes: Box[] = [];
  for (const item of spec.texts ?? []) {
    const [px, py] = [ev(item.x), ev(item.y)];
    if (finite(px, py)) boxes.push(labelBox(X(px), Y(py), { dx: item.dx ?? 0, dy: item.dy ?? 0, anchor: item.anchor ?? "start" }, item.t, item.size ?? 12));
  }
  const pointAt = (spec.pts ?? []).map((point) => [ev(point.x), ev(point.y)] as const);
  (spec.pts ?? []).forEach((point, index) => {
    const [px, py] = pointAt[index];
    if (!finite(px, py)) return;
    obstacles.push([X(px), Y(py)]);
    if (point.label && (point.dx !== undefined || point.dy !== undefined || point.anchor !== undefined)) {
      boxes.push(labelBox(X(px), Y(py), { dx: point.dx ?? 8, dy: point.dy ?? -8, anchor: point.anchor ?? "start" }, point.label, 12));
    }
  });
  const placements = (spec.pts ?? []).map((point, index): Placement | null => {
    const [px, py] = pointAt[index];
    if (!point.label || !finite(px, py)) return null;
    if (point.dx !== undefined || point.dy !== undefined || point.anchor !== undefined) return { dx: point.dx ?? 8, dy: point.dy ?? -8, anchor: point.anchor ?? "start" };
    const placement = choosePlacement({ x: X(px), y: Y(py), text: point.label, size: 12, bounds, obstacles, boxes });
    boxes.push(labelBox(X(px), Y(py), placement, point.label, 12));
    return placement;
  });

  return (
    <svg className={styles.plot} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? "函数图像"}>
      <defs>
        <clipPath id={clipId}>
          <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} />
        </clipPath>
      </defs>
      {xTicks.map((x) => (
        <line key={`gx${x}`} x1={X(x)} y1={mt} x2={X(x)} y2={H - mb} stroke={GRID} />
      ))}
      {yTicks.map((y) => (
        <line key={`gy${y}`} x1={ml} y1={Y(y)} x2={W - mr} y2={Y(y)} stroke={GRID} />
      ))}
      <line x1={ml} y1={Y(ay)} x2={W - mr + 5} y2={Y(ay)} stroke={AXIS} strokeWidth={1.4} />
      <ArrowHead x1={ml} y1={Y(ay)} x2={W - mr + 5} y2={Y(ay)} color={AXIS} length={7} />
      <line x1={X(ax)} y1={H - mb} x2={X(ax)} y2={mt - 5} stroke={AXIS} strokeWidth={1.4} />
      <ArrowHead x1={X(ax)} y1={H - mb} x2={X(ax)} y2={mt - 5} color={AXIS} length={7} />

      <g clipPath={`url(#${clipId})`}>
        {(spec.polys ?? []).map((poly, index) => {
          const points = poly.pts.map(([a, b]) => [ev(a), ev(b)] as const);
          if (!points.every(([a, b]) => finite(a, b))) return null;
          return (
            <polygon
              key={`poly${index}`}
              points={points.map(([a, b]) => `${X(a).toFixed(1)},${Y(b).toFixed(1)}`).join(" ")}
              fill={poly.fill ? tint(poly.fill) : "none"}
              stroke={poly.stroke ? COLOR[poly.stroke] : "none"}
              strokeWidth={poly.w ?? 1.6}
              strokeDasharray={poly.dash}
              strokeLinejoin="round"
            />
          );
        })}
        {(spec.curves ?? []).map((curve, index) => {
          const sampled = curves[index];
          if (!sampled) return null;
          return <path key={`curve${index}`} d={sampled.d} fill="none" stroke={pick(curve.color, "red")} strokeWidth={curve.w ?? 2.6} strokeDasharray={curve.dash} strokeLinejoin="round" />;
        })}
        {(spec.lines ?? []).map((line, index) => {
          const e = lineEnds(line);
          if (!e) return null;
          return <line key={`line${index}`} x1={X(e[0]).toFixed(1)} y1={Y(e[1]).toFixed(1)} x2={X(e[2]).toFixed(1)} y2={Y(e[3]).toFixed(1)} stroke={pick(line.color, "gray")} strokeWidth={line.w ?? 2} strokeDasharray={line.dash} />;
        })}
        {(spec.segs ?? []).map((seg, index) => {
          const [px, py, qx, qy] = [ev(seg.p[0]), ev(seg.p[1]), ev(seg.q[0]), ev(seg.q[1])];
          if (!finite(px, py, qx, qy)) return null;
          return <line key={`seg${index}`} x1={X(px).toFixed(1)} y1={Y(py).toFixed(1)} x2={X(qx).toFixed(1)} y2={Y(qy).toFixed(1)} stroke={pick(seg.color, "gray")} strokeWidth={seg.w ?? 2.2} strokeDasharray={seg.dash} />;
        })}
        {(spec.arrows ?? []).map((arrow, index) => {
          const [px, py, qx, qy] = [ev(arrow.p[0]), ev(arrow.p[1]), ev(arrow.q[0]), ev(arrow.q[1])];
          if (!finite(px, py, qx, qy)) return null;
          return <Arrow key={`arrow${index}`} x1={X(px)} y1={Y(py)} x2={X(qx)} y2={Y(qy)} color={pick(arrow.color, "blue")} width={arrow.w ?? 2.4} dash={arrow.dash} />;
        })}
      </g>

      {/* 刻度数字和坐标轴名称画在曲线之后，不会被曲线盖住 */}
      {xTicks.map((x) =>
        Math.abs(x) > 1e-9 ? (
          <Txt key={`tx${x}`} x={X(x)} y={Y(ay) + 15} anchor="middle" size={11} color={MUTED} halo>
            {num(x)}
          </Txt>
        ) : null,
      )}
      {yTicks.map((y) =>
        Math.abs(y) > 1e-9 ? (
          <Txt key={`ty${y}`} x={X(ax) - 6} y={Y(y) + 4} anchor="end" size={11} color={MUTED} halo>
            {num(y)}
          </Txt>
        ) : null,
      )}
      {ax === 0 && ay === 0 && (
        <Txt x={X(0) - 6} y={Y(0) + 14} anchor="end" size={11} color={MUTED} halo>
          O
        </Txt>
      )}
      {spec.xl && (
        <Txt x={W - mr} y={ay === y0 ? Y(ay) + 34 : Y(ay) - 7} anchor="end" size={12} color={AXIS} halo>
          {spec.xl}
        </Txt>
      )}
      {spec.yl && (
        <Txt x={X(ax) + 10} y={mt - 8} size={12} color={AXIS} halo>
          {spec.yl}
        </Txt>
      )}

      {(spec.pts ?? []).map((point, index) => {
        const [px, py] = [ev(point.x), ev(point.y)];
        if (!finite(px, py)) return null;
        return <circle key={`pt${index}`} cx={X(px).toFixed(1)} cy={Y(py).toFixed(1)} r={point.r ?? 4.6} fill={pick(point.color, "red")} stroke="#fff" strokeWidth={1.5} />;
      })}
      {(spec.pts ?? []).map((point, index) => {
        const [px, py] = [ev(point.x), ev(point.y)];
        const placement = placements[index];
        if (!point.label || !placement || !finite(px, py)) return null;
        return (
          <Txt key={`pl${index}`} x={X(px) + placement.dx} y={Y(py) + placement.dy} anchor={placement.anchor} size={12} color={pick(point.color, "red")} weight={700} halo>
            {point.label}
          </Txt>
        );
      })}
      {(spec.texts ?? []).map((item, index) => {
        const [px, py] = [ev(item.x), ev(item.y)];
        if (!finite(px, py)) return null;
        return (
          <Txt key={`tt${index}`} x={X(px) + (item.dx ?? 0)} y={Y(py) + (item.dy ?? 0)} anchor={item.anchor} size={item.size ?? 12} color={pick(item.color, "ink")} weight={item.weight ?? 700} halo>
            {item.t}
          </Txt>
        );
      })}
    </svg>
  );
}

// 读数里的 ⟦表达式⟧ 换成当前计算结果
function readoutText(source: string, vars: Vars): string {
  return source.replace(/⟦([^⟧]+)⟧/g, (_, expression: string) => {
    const f = compile(expression);
    return f ? num(f.evaluate(vars)) : "?";
  });
}

export function PlotFigureView({ figure }: { figure: PlotFigure }) {
  const param = figure.param;
  const [value, setValue] = useState(param?.value ?? 0);
  const vars: Vars = useMemo(() => (param ? { [param.name]: value } : {}), [param, value]);
  return (
    <figure className={styles.fig}>
      {figure.title && <div className={styles.title}>{figure.title}</div>}
      <div className={styles.plotbox}>
        <PlotSvg spec={figure} vars={vars} label={figure.title} />
      </div>
      {param && (
        <>
          <div className={styles.ctl}>
            <span className={styles.ctlLabel}>
              {param.label ?? param.name} = <b>{num(value)}</b>
            </span>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step ?? 0.05}
              value={value}
              aria-label={`拖动调整${param.label ?? param.name}`}
              onChange={(event) => setValue(parseFloat(event.target.value))}
            />
          </div>
          {figure.readout && (
            <div className={styles.readout} aria-live="polite">
              <RichText text={readoutText(figure.readout, vars)} />
            </div>
          )}
        </>
      )}
      {figure.caption && (
        <figcaption className={styles.cap}>
          <RichText text={figure.caption} />
        </figcaption>
      )}
    </figure>
  );
}

// 并排的几张小图：对比不同情形。宽度由容器决定，每张默认 300×250
export function PanelsFigureView({ figure }: { figure: PanelsFigure }) {
  return (
    <figure className={styles.fig}>
      <div className={styles.panels} style={{ "--pc": figure.items.length } as React.CSSProperties}>
        {figure.items.map((item, index) => (
          <div key={index} className={styles.panel}>
            {item.title && <div className={styles.ptitle}>{item.title}</div>}
            <PlotSvg spec={{ w: 300, h: 250, ...item }} vars={{}} label={item.title} />
          </div>
        ))}
      </div>
      {figure.caption && (
        <figcaption className={styles.cap}>
          <RichText text={figure.caption} />
        </figcaption>
      )}
    </figure>
  );
}
