// 函数图里点的名字放在哪：没有指定位置（dx、dy）的标签，在几个候选位置里挑一个不压着曲线、不压着别的标签、不出图的。
// 精选课程里的标签位置是手工调好的，不走这里；模型生成的图没法手工调，就靠它避开最明显的重叠。

export type LabelAnchor = "start" | "middle" | "end";
export type Placement = { dx: number; dy: number; anchor: LabelAnchor };
export type Box = { x0: number; y0: number; x1: number; y1: number };

// 中日韩字符按一个字号宽，其余按 0.58 个字号宽（估算，够用来避让）
export function textWidth(text: string, size: number): number {
  let width = 0;
  for (const ch of text) width += (ch.codePointAt(0) ?? 0) > 0x2e80 ? size : size * 0.58;
  return width;
}

export function labelBox(x: number, y: number, placement: Placement, text: string, size: number): Box {
  const width = textWidth(text, size);
  const left = x + placement.dx;
  const x0 = placement.anchor === "start" ? left : placement.anchor === "end" ? left - width : left - width / 2;
  const baseline = y + placement.dy;
  return { x0, x1: x0 + width, y0: baseline - size * 0.85, y1: baseline + size * 0.25 };
}

// 从右上开始，依次试：左上、右下、左下、正上、正下、右、左
const CANDIDATES: Placement[] = [
  { dx: 9, dy: -9, anchor: "start" },
  { dx: -9, dy: -9, anchor: "end" },
  { dx: 9, dy: 17, anchor: "start" },
  { dx: -9, dy: 17, anchor: "end" },
  { dx: 0, dy: -13, anchor: "middle" },
  { dx: 0, dy: 23, anchor: "middle" },
  { dx: 12, dy: 4, anchor: "start" },
  { dx: -12, dy: 4, anchor: "end" },
];

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function choosePlacement({
  x,
  y,
  text,
  size,
  bounds,
  obstacles,
  boxes,
}: {
  x: number;
  y: number;
  text: string;
  size: number;
  // 绘图区
  bounds: Box;
  // 曲线、直线上的采样点（像素坐标）和各个点本身
  obstacles: [number, number][];
  // 已经放好的标签、文字的位置
  boxes: Box[];
}): Placement {
  let best = CANDIDATES[0];
  let bestScore = Infinity;
  CANDIDATES.forEach((candidate, index) => {
    const box = labelBox(x, y, candidate, text, size);
    let score = index * 0.5;
    // 出了绘图区：按出去的多少罚分
    score += Math.max(0, bounds.x0 - box.x0) + Math.max(0, box.x1 - bounds.x1) + Math.max(0, bounds.y0 - box.y0) + Math.max(0, box.y1 - bounds.y1);
    for (const other of boxes) if (overlaps(box, other)) score += 60;
    for (const [ox, oy] of obstacles) if (ox >= box.x0 - 2 && ox <= box.x1 + 2 && oy >= box.y0 - 2 && oy <= box.y1 + 2) score += 1;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}
