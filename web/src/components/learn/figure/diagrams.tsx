import type { Figure } from "@/lib/learn/figure";
import { RichText } from "../source-badges";
import styles from "./figure.module.css";
import { Arrow, COLOR, MUTED, OUTLINE, soft, Txt } from "./svg";

// 几何示意与数据结构图：格子（数组、栈、样本空间）、环形队列、概率树、比例条、矩阵形状。全部用 SVG 自己画。

type Of<T extends Figure["t"]> = Extract<Figure, { t: T }>;

function Frame({ title, caption, children, box = true, narrow = false }: { title?: string; caption?: string; children: React.ReactNode; box?: boolean; narrow?: boolean }) {
  return (
    <figure className={styles.fig}>
      {title && <div className={styles.title}>{title}</div>}
      {box ? <div className={narrow ? `${styles.plotbox} ${styles.ringbox}` : styles.plotbox}>{children}</div> : children}
      {caption && (
        <figcaption className={styles.cap}>
          <RichText text={caption} />
        </figcaption>
      )}
    </figure>
  );
}

// ---------- 格子：数组、栈、带分组的样本空间 ----------
export function CellsFigureView({ figure }: { figure: Of<"cells"> }) {
  const n = figure.items.length;
  const cw = figure.cw ?? 62;
  const ch = figure.ch ?? 46;
  const ox = 16;
  const ptrs = figure.ptr ?? [];
  const sets = figure.sets ?? [];
  const top = ptrs.some((ptr) => ptr.pos !== "below") ? 46 : 14;
  const idxH = figure.idx ? 18 : 0;
  const below = ptrs.some((ptr) => ptr.pos === "below") ? 40 : 0;
  const W = ox * 2 + n * cw;
  const H = top + ch + idxH + below + (sets.length ? 14 + sets.length * 20 : 0) + 10;
  return (
    <Frame title={figure.title} caption={figure.caption}>
      <svg className={styles.plot} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={figure.title ?? "格子示意图"}>
        {figure.items.map((item, i) => {
          const x = ox + i * cw;
          const dim = figure.dim?.includes(i);
          const hi = figure.hi?.includes(i);
          return (
            <g key={i}>
              <rect x={x} y={top} width={cw} height={ch} rx={6} fill={hi ? soft("red") : "#fff"} stroke={hi ? COLOR.red : OUTLINE} strokeWidth={hi ? 2 : 1.4} opacity={dim ? 0.4 : 1} />
              {item !== "" && (
                <Txt x={x + cw / 2} y={top + ch / 2 + 5} anchor="middle" size={16} weight={800} color={dim ? COLOR.gray : COLOR.ink}>
                  {item}
                </Txt>
              )}
              {figure.idx && (
                <Txt x={x + cw / 2} y={top + ch + 14} anchor="middle" size={11} color={COLOR.gray}>
                  {String(i)}
                </Txt>
              )}
              {figure.mark?.includes(i) && (
                <>
                  <line x1={x + 8} y1={top + 8} x2={x + cw - 8} y2={top + ch - 8} stroke={COLOR.red} strokeWidth={2.4} />
                  <line x1={x + cw - 8} y1={top + 8} x2={x + 8} y2={top + ch - 8} stroke={COLOR.red} strokeWidth={2.4} />
                </>
              )}
            </g>
          );
        })}
        {ptrs.map((ptr, index) => {
          const cx = ox + ptr.i * cw + cw / 2;
          const color = COLOR[ptr.color ?? "blue"];
          if (ptr.pos === "below") {
            const y = top + ch + idxH;
            return (
              <g key={`ptr${index}`}>
                <Arrow x1={cx} y1={y + 30} x2={cx} y2={y + 4} color={color} head={8} />
                <Txt x={cx} y={y + 42} anchor="middle" size={12} color={color} weight={800}>
                  {ptr.label}
                </Txt>
              </g>
            );
          }
          return (
            <g key={`ptr${index}`}>
              <Txt x={cx} y={14} anchor="middle" size={12} color={color} weight={800}>
                {ptr.label}
              </Txt>
              <Arrow x1={cx} y1={20} x2={cx} y2={top - 3} color={color} head={8} />
            </g>
          );
        })}
        {sets.map((set, j) => {
          const y = top + ch + idxH + below + 12 + j * 20;
          return (
            <g key={`set${j}`}>
              {set.idx.map((i) => (
                <rect key={i} x={ox + i * cw + 4} y={y} width={cw - 8} height={7} rx={3} fill={COLOR[set.color]} />
              ))}
              <Txt x={ox + n * cw - 2} y={y + 7} anchor="end" size={11} color={COLOR[set.color]} weight={800}>
                {set.name}
              </Txt>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

// ---------- 环形队列 ----------
export function RingFigureView({ figure }: { figure: Of<"ring"> }) {
  const { n } = figure;
  const R1 = 96;
  const R0 = 54;
  const cx = 150;
  const cy = 130;
  const step = (Math.PI * 2) / n;
  const gap = 0.04;
  const P = (r: number, angle: number): [number, number] => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  const same = figure.front === figure.rear;
  const pointers = [
    { i: figure.front, label: "front", color: COLOR.blue, off: same ? -0.38 : 0.38 },
    { i: figure.rear, label: "rear", color: COLOR.red, off: 0.38 },
  ];
  return (
    <Frame caption={figure.caption} narrow>
      <svg className={styles.plot} viewBox="-20 0 340 300" role="img" aria-label="环形队列示意图">
        {Array.from({ length: n }, (_, i) => {
          const a0 = -Math.PI / 2 + i * step + gap;
          const a1 = -Math.PI / 2 + (i + 1) * step - gap;
          const am = (a0 + a1) / 2;
          const [x0, y0] = P(R1, a0);
          const [x1, y1] = P(R1, a1);
          const [x2, y2] = P(R0, a1);
          const [x3, y3] = P(R0, a0);
          const item = figure.items[i] ?? "";
          const [tx, ty] = P((R0 + R1) / 2, am);
          const [ix, iy] = P(R1 + 12, am);
          return (
            <g key={i}>
              <path d={`M${x0} ${y0} A${R1} ${R1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${R0} ${R0} 0 0 0 ${x3} ${y3} Z`} fill={item ? soft("gold") : "#fff"} stroke={item ? COLOR.gold : OUTLINE} strokeWidth={1.6} />
              {item && (
                <Txt x={tx} y={ty + 6} anchor="middle" size={18} weight={800}>
                  {item}
                </Txt>
              )}
              <Txt x={ix} y={iy + 4} anchor="middle" size={11} color={COLOR.gray}>
                {String(i)}
              </Txt>
            </g>
          );
        })}
        {pointers.map((pointer) => {
          // 箭头从格子的一侧指进去，避开格外的下标数字
          const am = -Math.PI / 2 + (pointer.i + 0.5) * step + pointer.off;
          const [ax, ay] = P(R1 + 40, am);
          const [bx, by] = P(R1 + 6, am);
          const [lx, ly] = P(R1 + 56, am);
          return (
            <g key={pointer.label}>
              <Arrow x1={ax} y1={ay} x2={bx} y2={by} color={pointer.color} head={8} />
              <Txt x={lx} y={ly + 4} anchor="middle" size={12} color={pointer.color} weight={800}>
                {pointer.label}
              </Txt>
            </g>
          );
        })}
        {figure.center && (
          <Txt x={cx} y={cy + 4} anchor="middle" size={12} color={MUTED}>
            {figure.center}
          </Txt>
        )}
      </svg>
    </Frame>
  );
}

// ---------- 概率树 ----------
export function TreeFigureView({ figure }: { figure: Of<"tree"> }) {
  const W = 520;
  const H = figure.h ?? 280;
  const pos = new Map(figure.nodes.map((node) => [node.id, [(node.x / 100) * W, (node.y / 100) * H] as const]));
  const width = new Map(figure.nodes.map((node) => [node.id, node.w ?? 76]));
  return (
    <Frame caption={figure.caption}>
      <svg className={styles.plot} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="概率树">
        {figure.edges.map((edge, index) => {
          const a = pos.get(edge.a);
          const b = pos.get(edge.b);
          if (!a || !b) return null;
          return <line key={`e${index}`} x1={a[0] + (width.get(edge.a) ?? 76) / 2} y1={a[1]} x2={b[0] - (width.get(edge.b) ?? 76) / 2} y2={b[1]} stroke="#a89b8a" strokeWidth={1.8} />;
        })}
        {figure.edges.map((edge, index) => {
          const a = pos.get(edge.a);
          const b = pos.get(edge.b);
          if (!a || !b) return null;
          return (
            <Txt key={`l${index}`} x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - (b[1] < a[1] ? -2 : 4) - 4} anchor="middle" size={12} color={COLOR.blue} weight={800} halo>
              {edge.t}
            </Txt>
          );
        })}
        {figure.nodes.map((node) => {
          const [x, y] = pos.get(node.id)!;
          const w = node.w ?? 76;
          return (
            <g key={node.id}>
              <rect x={x - w / 2} y={y - 15} width={w} height={30} rx={9} fill={node.fill ? soft(node.fill) : "#fff"} stroke={node.stroke ? COLOR[node.stroke] : OUTLINE} strokeWidth={1.6} />
              <Txt x={x} y={y + 5} anchor="middle" size={13} weight={800} color={COLOR[node.color ?? "ink"]}>
                {node.t}
              </Txt>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

// ---------- 横向比例条 ----------
export function BarsFigureView({ figure }: { figure: Of<"bars"> }) {
  const W = 520;
  const bw = 470;
  const rh = 72;
  const H = figure.rows.length * rh + 14;
  return (
    <Frame caption={figure.caption}>
      <svg className={styles.plot} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="比例条">
        {figure.rows.map((row, k) => {
          const y = 12 + k * rh;
          const total = row.segs.reduce((sum, seg) => sum + seg.v, 0) || 1;
          let x = 24;
          return (
            <g key={k}>
              <Txt x={24} y={y + 11} size={12.5} weight={800} color="#4a423b">
                {row.label}
              </Txt>
              {row.segs.map((seg, j) => {
                const w = Math.max(3, (seg.v / total) * bw);
                const left = x;
                x += w;
                const inside = w > 120;
                return (
                  <g key={j}>
                    <rect x={left} y={y + 18} width={w} height={26} rx={j === 0 ? 7 : 0} fill={COLOR[seg.color]} />
                    {inside ? (
                      <Txt x={left + w / 2} y={y + 36} anchor="middle" size={12} color={seg.color === "sand" ? COLOR.ink : "#fff"} weight={800}>
                        {seg.label}
                      </Txt>
                    ) : (
                      <Txt x={Math.min(left + w / 2, W - 60)} y={y + 58} anchor={left + w / 2 > W - 80 ? "end" : "middle"} size={11.5} color={seg.color === "sand" ? MUTED : COLOR[seg.color]} weight={800}>
                        {seg.label}
                      </Txt>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

// ---------- 矩阵形状：内维相同才能乘 ----------
export function ShapesFigureView({ figure }: { figure: Of<"shapes"> }) {
  const c = 20;
  const [m, n] = figure.a;
  const [n2, p] = figure.b;
  const ok = n === n2;
  const gh = Math.max(m, n2, ok ? m : 2) * c;
  const y0 = 38;
  const ax = 20;
  const bx = ax + n * c + 56;
  const cx2 = bx + p * c + 56;
  const grid = (x: number, rows: number, cols: number, color: "blue" | "red" | "green") =>
    Array.from({ length: rows * cols }, (_, k) => {
      const i = Math.floor(k / cols);
      const j = k % cols;
      return <rect key={k} x={x + j * c} y={y0 + i * c} width={c - 2} height={c - 2} rx={3} fill={soft(color)} stroke={COLOR[color]} />;
    });
  const tone = ok ? COLOR.green : COLOR.red;
  const midA = ax + n * c;
  const W = Math.max(cx2 + p * c + 90, 340);
  const H = y0 + gh + 34;
  return (
    <Frame caption={figure.caption}>
      <svg className={styles.plot} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="矩阵形状示意图">
        {grid(ax, m, n, "blue")}
        <Txt x={ax + (n * c) / 2} y={y0 + m * c + 18} anchor="middle" size={12.5} weight={800} color={COLOR.blue}>
          {`A：${m}×${n}`}
        </Txt>
        <Txt x={ax + n * c + 28} y={y0 + (m * c) / 2 + 6} anchor="middle" size={20} weight={800} color={MUTED}>
          ×
        </Txt>
        {grid(bx, n2, p, "red")}
        <Txt x={bx + (p * c) / 2} y={y0 + n2 * c + 18} anchor="middle" size={12.5} weight={800} color={COLOR.red}>
          {`B：${n2}×${p}`}
        </Txt>
        <Txt x={bx + p * c + 28} y={y0 + (Math.max(m, n2) * c) / 2 + 6} anchor="middle" size={20} weight={800} color={ok ? MUTED : COLOR.red}>
          {ok ? "=" : "≠"}
        </Txt>
        {ok ? (
          <>
            {grid(cx2, m, p, "green")}
            <Txt x={cx2 + (p * c) / 2} y={y0 + m * c + 18} anchor="middle" size={12.5} weight={800} color={COLOR.green}>
              {`AB：${m}×${p}`}
            </Txt>
          </>
        ) : (
          <>
            <Txt x={cx2 - 4} y={y0 + 20} size={14} weight={800} color={COLOR.red}>
              没有定义
            </Txt>
            <Txt x={cx2 - 4} y={y0 + 42} size={11.5} color={COLOR.red}>
              {`A 的一行有 ${n} 个数`}
            </Txt>
            <Txt x={cx2 - 4} y={y0 + 62} size={11.5} color={COLOR.red}>
              {`B 的一列只有 ${n2} 个数`}
            </Txt>
          </>
        )}
        <path d={`M${midA - 4} ${y0 - 8} L${midA - 4} ${y0 - 14} L${bx + 2} ${y0 - 14} L${bx + 2} ${y0 - 8}`} fill="none" stroke={tone} strokeWidth={2} />
        <Txt x={(midA + bx) / 2} y={y0 - 20} anchor="middle" size={12} weight={800} color={tone}>
          {ok ? `内维相同（都是 ${n}）` : `内维不同（${n} ≠ ${n2}）`}
        </Txt>
      </svg>
    </Frame>
  );
}
