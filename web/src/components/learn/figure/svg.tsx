import type { ReactNode } from "react";
import type { FigureColor } from "@/lib/learn/figure";

// 图像共用的小工具：配色、数字格式、带白边的文字、箭头。图像画在白底上，深浅色主题下都用同一套颜色。

export const COLOR: Record<FigureColor, string> = {
  red: "#d8432b",
  blue: "#2a6fdb",
  green: "#1d7a4d",
  gold: "#c07a10",
  gray: "#8a8178",
  ink: "#231f1b",
  sand: "#c9bfb0",
};
// 半透明的填充色（多边形、集合条）
const TINT: Record<FigureColor, string> = {
  red: "rgba(216,67,43,.16)",
  blue: "rgba(42,111,219,.16)",
  green: "rgba(29,122,77,.16)",
  gold: "rgba(192,122,16,.16)",
  gray: "rgba(138,129,120,.16)",
  ink: "rgba(35,31,27,.12)",
  sand: "rgba(201,191,176,.3)",
};
// 浅底色（树的节点、被强调的格子、矩阵形状图）
const SOFT: Record<FigureColor, string> = {
  red: "#fdece7",
  blue: "#e8f0fe",
  green: "#e6f5ed",
  gold: "#fff4e8",
  gray: "#f1ede8",
  ink: "#efece8",
  sand: "#f6f1ea",
};
export const tint = (color: FigureColor) => TINT[color];
export const soft = (color: FigureColor) => SOFT[color];

export const MUTED = "#7a7068";
export const AXIS = "#4a423b";
export const GRID = "#efe7da";
export const OUTLINE = "#bfb3a3";

// 保留三位小数，负号用数学减号
export function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded).replace("-", "−");
}

// 刻度间隔：把区间分成大约 6 格，取 1、2、5 的整数倍
export function niceStep(range: number): number {
  const raw = range / 6;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const mantissa = raw / power;
  return (mantissa < 1.5 ? 1 : mantissa < 3.5 ? 2 : mantissa < 7.5 ? 5 : 10) * power;
}

// halo：给文字描一圈白边，压在线条上时也看得清，线条被文字「断开」而不是穿过文字
export function Txt({
  x,
  y,
  children,
  anchor = "start",
  color = COLOR.ink,
  size = 13,
  weight = 500,
  halo = false,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: "start" | "middle" | "end";
  color?: string;
  size?: number;
  weight?: number;
  halo?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill={color}
      fontSize={size}
      fontWeight={weight}
      {...(halo ? { stroke: "#fff", strokeWidth: 3.4, strokeLinejoin: "round" as const, paintOrder: "stroke" } : {})}
    >
      {children}
    </text>
  );
}

// 箭头头部：在 (x2, y2) 处画一个指向前进方向的小三角
export function ArrowHead({ x1, y1, x2, y2, color, length = 9 }: { x1: number; y1: number; x2: number; y2: number; color: string; length?: number }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = 0.42;
  const corner = (turn: number) => `${(x2 - length * Math.cos(angle + turn)).toFixed(1)},${(y2 - length * Math.sin(angle + turn)).toFixed(1)}`;
  return <polygon points={`${x2.toFixed(1)},${y2.toFixed(1)} ${corner(-spread)} ${corner(spread)}`} fill={color} />;
}

export function Arrow({ x1, y1, x2, y2, color, width = 2.4, dash, head = 10 }: { x1: number; y1: number; x2: number; y2: number; color: string; width?: number; dash?: string; head?: number }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeDasharray={dash} />
      <ArrowHead x1={x1} y1={y1} x2={x2} y2={y2} color={color} length={head} />
    </g>
  );
}
