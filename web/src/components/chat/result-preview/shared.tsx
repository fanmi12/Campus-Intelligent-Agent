"use client";

import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import styles from "./results.module.css";

export function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  return <button type="button" className={styles.secondary} onClick={async () => {
    try { await navigator.clipboard.writeText(text); toast.success("已复制"); }
    catch { toast.error("复制失败，请长按文字复制"); }
  }}><Copy className="size-3.5" />{label}</button>;
}

export function DownloadButton({ filename, text, label = "下载清单" }: { filename: string; text: string; label?: string }) {
  return <button type="button" className={styles.secondary} onClick={() => downloadText(filename, text)}><Download className="size-3.5" />{label}</button>;
}
