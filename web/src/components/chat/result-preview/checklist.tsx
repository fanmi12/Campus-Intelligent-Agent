"use client";

import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { ChecklistData } from "@/lib/ai/result-schemas";
import { ResultReferences } from "./references";
import { DownloadButton } from "./shared";
import styles from "./results.module.css";

export function ProcedureChecklist({ data }: { data: ChecklistData }) {
  const reentrySteps = data.steps;
  const [checked, setChecked] = useState<number[]>([]);
  const text = [data.title, ...reentrySteps.map((step, index) => `${checked.includes(index) ? "[已完成]" : "[待完成]"} ${index + 1}. ${step.title}\n${step.detail}`), ...data.references.map((ref) => `来源：${ref.title} ${ref.url ?? ""}`), "仅为个人勾选记录，不代表学校审批状态。"].join("\n\n");
  return (
    <article className={styles.card} aria-label={data.title}>
      <div className={styles.body}>
        <div className="flex items-start justify-between gap-3"><div><h3 className={styles.title}>{data.title}</h3><p className={styles.muted}>我的办理清单 · 勾选自己的完成情况</p></div><button type="button" className={styles.iconButton} aria-label="重置办理清单" disabled={checked.length === 0} onClick={() => setChecked([])}><RotateCcw className="size-4" /></button></div>
        <div className={styles.progress} role="progressbar" aria-label="办理清单完成进度" aria-valuemin={0} aria-valuemax={reentrySteps.length} aria-valuenow={checked.length}><span style={{ width: `${checked.length / reentrySteps.length * 100}%` }} /></div>
        <p className={styles.muted} role="status">已完成 {checked.length} / {reentrySteps.length} 项{checked.length === reentrySteps.length ? "，清单已经全部勾选。" : "，展开每一步可以看具体要求。"}</p>
        <ol className={styles.steps}>{reentrySteps.map((step, index) => <li key={step.title} data-done={checked.includes(index)}>
          <label className={styles.checkbox}><input type="checkbox" aria-label={`完成：${step.title}`} checked={checked.includes(index)} onChange={() => setChecked((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} /><span aria-hidden="true">{checked.includes(index) ? <Check className="size-3.5" /> : index + 1}</span></label>
          <details className={styles.stepDetails}><summary>{step.title}</summary><p>{step.detail}</p></details>
        </li>)}</ol>
        <DownloadButton filename={`${data.title}.txt`} text={text} />
        <p className={styles.footnote}>勾选只记录个人进度，不会提交审批。</p>
        <ResultReferences basis={data.basis} references={data.references} />
      </div>
    </article>
  );
}
