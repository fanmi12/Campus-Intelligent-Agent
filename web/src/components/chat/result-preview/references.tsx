import { ExternalLink } from "lucide-react";
import type { ResultReference } from "@/lib/ai/result-schemas";
import styles from "./results.module.css";

export function ResultReferences({ basis, references }: { basis: "user" | "sources"; references: ResultReference[] }) {
  return <div className="space-y-2 border-t pt-3">
    <p className={styles.footnote}>{basis === "user" ? "根据你提供的信息整理。" : "根据本轮资料整理，办理或出行前请核对原文。"}</p>
    {references.map((reference) => <p key={reference.n} className={styles.footnote}>{reference.url && /^https?:\/\//.test(reference.url) ? <a className={styles.sourceLink} href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}<ExternalLink className="size-3 shrink-0" /></a> : reference.title}{reference.updated && <span> · 资料更新：{reference.updated}</span>}</p>)}
  </div>;
}
