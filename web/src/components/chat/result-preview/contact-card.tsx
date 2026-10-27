"use client";

import { Download, MapPin, Phone, School } from "lucide-react";
import type { ContactData } from "@/lib/ai/result-schemas";
import { CopyButton, downloadText } from "./shared";
import { ResultReferences } from "./references";
import styles from "./results.module.css";

const escapeVcard = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, "\\$&");

export function ContactCard({ data }: { data: ContactData }) {
  const contactText = [data.organization, data.name, ...data.phones.map((phone) => `${phone.label}：${phone.number}`), data.address, ...data.references.map((ref) => `${ref.title} ${ref.url ?? ""}`)].filter(Boolean).join("\n");
  const vcard = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVcard(data.name)}`, data.organization ? `ORG:${escapeVcard(data.organization)}` : "", ...data.phones.map((phone) => `TEL;TYPE=WORK,VOICE:${phone.number.replace(/[^+\d]/g, "")}`), data.address ? `ADR;TYPE=WORK:;;${escapeVcard(data.address)};;;;` : "", "END:VCARD"].filter(Boolean).join("\r\n") + "\r\n";
  return (
    <article className={styles.card} aria-label="校园联系卡">
      <div className={styles.contactHeading}><span className={styles.contactIcon}><School className="size-6" /></span><div><h3 className={styles.title}>{data.name}</h3>{data.organization && <p className={styles.muted}>{data.organization}</p>}</div></div>
      <div className={styles.body}>
        <div className={styles.contactPhones}>{data.phones.map((phone) => <a key={phone.number} href={`tel:${phone.number.replace(/[^+\d]/g, "")}`} aria-label={`拨打${phone.label}${phone.number}`}><span><small>{phone.label}</small><strong>{phone.number}</strong></span><Phone className="size-4" /></a>)}</div>
        {data.address && <p className="flex items-start gap-2 text-[13px] leading-6"><MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" />{data.address}</p>}
        <div className="flex flex-wrap gap-2"><CopyButton text={contactText} label="复制联系方式" /><button type="button" className={styles.secondary} onClick={() => downloadText(`${data.name}.vcf`, vcard, "text/vcard;charset=utf-8")}><Download className="size-3.5" />保存联系人</button></div>
        <p className={styles.footnote}>点击号码会打开拨号界面。</p>
        <ResultReferences basis={data.basis} references={data.references} />
      </div>
    </article>
  );
}
