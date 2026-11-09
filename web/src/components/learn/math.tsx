"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Matrix } from "@/lib/learn/math/rich";
import { splitTexAtRelations, texToMathML, texToPlain } from "@/lib/learn/math/tex";
import styles from "./math.module.css";

// 公式和矩阵的渲染。公式是 $…$ 里的 LaTeX 子集，转成 MathML 交给浏览器排版（没有任何依赖）；
// 浏览器不支持 MathML（Chrome 109 之前的内核，部分安卓微信）时退回纯文本写法，仍然能读。

let supported: boolean | undefined;

// 能不能排 MathML：量一个 <mspace> 的宽高，支持的浏览器会按设定的尺寸排出来
function detectMathml(): boolean {
  if (supported !== undefined) return supported;
  try {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;";
    host.innerHTML = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mspace height="23px" width="77px"></mspace></math>';
    document.body.appendChild(host);
    const box = host.firstElementChild?.firstElementChild?.getBoundingClientRect();
    host.remove();
    supported = Boolean(box && Math.abs(box.height - 23) <= 1 && Math.abs(box.width - 77) <= 1);
  } catch {
    supported = true;
  }
  return supported;
}

const noopSubscribe = () => () => {};
// 服务端渲染时先按「支持」输出，挂载后发现不支持再换成纯文本（useSyncExternalStore 会处理水合）
export function useMathmlSupport(): boolean {
  return useSyncExternalStore(noopSubscribe, detectMathml, () => true);
}

type Rendered = { html: string; plain: string } | { error: string };
const cache = new Map<string, Rendered>();

function render(tex: string): Rendered {
  const hit = cache.get(tex);
  if (hit) return hit;
  let result: Rendered;
  try {
    // 长公式按最外层的等号拆成几段，窄屏上才能换行
    const html = splitTexAtRelations(tex).map(texToMathML).join(" ");
    result = { html, plain: texToPlain(tex) };
  } catch (error) {
    result = { error: error instanceof Error ? error.message : "公式格式不对" };
  }
  if (cache.size > 800) cache.clear();
  cache.set(tex, result);
  return result;
}

export function Formula({ tex }: { tex: string }) {
  const mathml = useMathmlSupport();
  const rendered = useMemo(() => render(tex), [tex]);
  if ("error" in rendered) {
    return (
      <span className={styles.fail} title={rendered.error}>
        {tex}
      </span>
    );
  }
  if (!mathml) return <span className={styles.plain}>{rendered.plain}</span>;
  // html 是 texToMathML 生成的：只含固定的 MathML 标签，文字都做过转义，没有外部输入的属性
  return <span className={styles.math} role="math" aria-label={rendered.plain} dangerouslySetInnerHTML={{ __html: rendered.html }} />;
}

// 矩阵：用 CSS 网格画（不用 table：table 放在 <p> 里会把段落提前关掉）；增广矩阵在最后一列前画虚线
export function MatrixView({ matrix, source }: { matrix: Matrix; source: string }) {
  const width = matrix.rows[0]?.length ?? 1;
  return (
    <span className={styles.mat} role="img" aria-label={`矩阵 ${source}`}>
      <span className={`${styles.matBracket} ${styles.matLeft}`} aria-hidden />
      <span className={styles.matGrid} style={{ gridTemplateColumns: `repeat(${width}, auto)` }} aria-hidden>
        {matrix.rows.map((row, r) =>
          row.map((cell, c) => (
            <span key={`${r}-${c}`} className={matrix.aug >= 0 && c === matrix.aug ? `${styles.matCell} ${styles.matAug}` : styles.matCell}>
              {cell}
            </span>
          )),
        )}
      </span>
      <span className={`${styles.matBracket} ${styles.matRight}`} aria-hidden />
    </span>
  );
}
