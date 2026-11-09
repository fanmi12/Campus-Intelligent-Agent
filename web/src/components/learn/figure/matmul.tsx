"use client";

import { useState } from "react";
import type { Figure } from "@/lib/learn/figure";
import { Formula } from "../math";
import { RichText } from "../source-badges";
import styles from "./figure.module.css";
import { num } from "./svg";

// 矩阵乘法逐步演示：每点一次「下一步」算出 AB 的一个元素，同时高亮用到的那一行和那一列

function Grid({ rows, cell }: { rows: (string | number)[][]; cell: (i: number, j: number, value: string | number) => { text: string; cls?: string } }) {
  return (
    <span className={styles.mat}>
      <span className={`${styles.matBracket} ${styles.matLeft}`} aria-hidden />
      <span className={styles.matGrid} style={{ gridTemplateColumns: `repeat(${rows[0].length}, auto)` }}>
        {rows.map((row, i) =>
          row.map((value, j) => {
            const { text, cls } = cell(i, j, value);
            return (
              <span key={`${i}-${j}`} className={cls ? `${styles.matCell} ${cls}` : styles.matCell}>
                {text}
              </span>
            );
          }),
        )}
      </span>
      <span className={`${styles.matBracket} ${styles.matRight}`} aria-hidden />
    </span>
  );
}

export function MatmulFigureView({ figure }: { figure: Extract<Figure, { t: "matmul" }> }) {
  const A = figure.A;
  const B = figure.B;
  const m = A.length;
  const p = B[0].length;
  const total = m * p;
  const [step, setStep] = useState(0);
  const cur = step - 1;
  const ci = cur >= 0 ? Math.floor(cur / p) : -1;
  const cj = cur >= 0 ? cur % p : -1;
  const value = (i: number, j: number) => A[i].reduce((sum, a, k) => sum + a * B[k][j], 0);
  const paren = (v: number) => (v < 0 ? `(${num(v)})` : num(v));
  const C = Array.from({ length: m }, (_, i) => Array.from({ length: p }, (_, j) => i * p + j));

  let formula: React.ReactNode = <span className={styles.muted}>点「下一步」，逐个算出 AB 的每个元素</span>;
  if (cur >= 0) {
    const terms = A[ci].map((a, k) => `${paren(a)}\\times ${paren(B[k][cj])}`).join("+");
    formula = (
      <>
        <Formula tex={`c_{${ci + 1}${cj + 1}}=${terms}=${num(value(ci, cj))}`} />
        <span className={styles.muted}>
          　取 A 的第 {ci + 1} 行 × B 的第 {cj + 1} 列
        </span>
      </>
    );
  }
  return (
    <figure className={styles.fig}>
      {figure.title && <div className={styles.title}>{figure.title}</div>}
      <div className={styles.mm}>
        <div className={styles.mmRow}>
          <Grid rows={A} cell={(i, _j, v) => ({ text: num(Number(v)), cls: i === ci ? styles.hlRow : undefined })} />
          <b className={styles.mmOp}>×</b>
          <Grid rows={B} cell={(_i, j, v) => ({ text: num(Number(v)), cls: j === cj ? styles.hlCol : undefined })} />
          <b className={styles.mmOp}>=</b>
          <Grid rows={C} cell={(i, j, idx) => ({ text: Number(idx) <= cur ? num(value(i, j)) : "?", cls: Number(idx) === cur ? styles.hlCell : Number(idx) < cur ? styles.doneCell : undefined })} />
        </div>
        <div className={styles.mmFormula} aria-live="polite">
          {formula}
        </div>
        <div className={styles.mmButtons}>
          <button type="button" className={styles.mmButton} disabled={step === 0} onClick={() => setStep(0)}>
            ⟲ 重置
          </button>
          <button type="button" className={styles.mmButton} disabled={step === 0} onClick={() => setStep(step - 1)}>
            ◀ 上一步
          </button>
          <button type="button" className={styles.mmButton} data-primary="true" disabled={step >= total} onClick={() => setStep(step + 1)}>
            下一步 ▶ ({step}/{total})
          </button>
        </div>
      </div>
      {figure.caption && (
        <figcaption className={styles.cap}>
          <RichText text={figure.caption} />
        </figcaption>
      )}
    </figure>
  );
}
