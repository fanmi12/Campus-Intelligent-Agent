"use client";

import { CalendarPlus, Check, Clock, MapPin } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { ExamData } from "@/lib/ai/result-schemas";
import { describeEventTime, downloadIcs } from "@/lib/ics";
import { ResultReferences } from "./result-preview/references";
import styles from "./result-preview/results.module.css";

const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const subscribe = (notify: () => void) => { const timer = window.setInterval(notify, 60000); return () => window.clearInterval(timer); };

export function ExamMemo({ data, preview = false }: { data: ExamData; preview?: boolean }) {
  const currentDate = useSyncExternalStore(subscribe, today, today);
  const [date, setDate] = useState(data.event.start.slice(0, 10));
  const [checked, setChecked] = useState<string[]>([]);
  const effectiveDate = preview ? date : data.event.start.slice(0, 10);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && Number.isFinite(Date.parse(`${effectiveDate}T00:00:00Z`));
  const reference = preview ? "2026-10-26" : currentDate;
  const days = valid ? Math.round((Date.parse(`${effectiveDate}T00:00:00Z`) - Date.parse(`${reference}T00:00:00Z`)) / 86400000) : null;
  const event = preview && valid ? { ...data.event, start: data.event.start.replace(/^\d{4}-\d{2}-\d{2}/, date), end: data.event.end?.replace(/^\d{4}-\d{2}-\d{2}/, date) } : data.event;
  const time = describeEventTime(data.event);
  return <article className={styles.card} aria-label="考试备忘卡">
    <div className={styles.examTop}>
      <div className="flex items-center justify-between gap-2"><h3 className={styles.title}>{data.event.title}</h3>{preview && <span className={styles.demoTag}>演示安排</span>}</div>
      <p className="mt-5 text-sm">{days === null ? "请选择考试日期" : days < 0 ? "这场考试已过去" : days === 0 ? "这场考试就在今天" : "距离考试还有"}</p>
      <p className={styles.countdown} aria-live="polite">{days === null ? "—" : Math.abs(days)}<span>天</span></p>
      <p className="flex items-center gap-1.5 text-xs"><Clock className="size-3.5" />{preview ? effectiveDate : `${time.month}月${time.day}日 ${time.weekday}`} · {time.range}</p>
      {data.event.location && <p className="mt-2 flex items-start gap-1.5 text-xs"><MapPin className="size-3.5 shrink-0" />{data.event.location}</p>}
    </div>
    <div className={styles.body}>
      {preview && <label className={styles.dateLabel}>试着调整考试日期<input type="date" aria-label="示例考试日期" min="2026-01-01" max="2030-12-31" value={date} onChange={(event) => setDate(event.target.value)} /></label>}
      {data.checklist.length > 0 && <><h4 className="text-sm font-medium">考前别落下</h4><div className={styles.examChecklist}>{data.checklist.map((item) => <label key={item}><input type="checkbox" checked={checked.includes(item)} onChange={() => setChecked((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} /><span>{item}</span>{checked.includes(item) && <Check className="ml-auto size-3.5 text-success" />}</label>)}</div></>}
      {data.event.notes && <p className={styles.footnote}>{data.event.notes}</p>}
      <button type="button" className={styles.primary} disabled={!valid} onClick={() => downloadIcs([event], data.event.title)}><CalendarPlus className="size-4" />生成考试日历文件</button>
      <p className={styles.footnote}>{preview ? "以 2026-10-26 为演示基准。" : "倒计时按北京时间计算。"}下载文件后还需导入日历，页面不会自动设置系统提醒。</p>
      <ResultReferences basis={data.basis} references={data.references} />
    </div>
  </article>;
}
