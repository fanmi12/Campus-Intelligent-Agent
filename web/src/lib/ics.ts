import type { CalendarEvent } from "@/lib/ai/tools";

// 生成标准 iCalendar（.ics）文件：iPhone、安卓、电脑日历都能直接导入

const pad = (value: number) => String(value).padStart(2, "0");

function utcStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function dateValue(isoDate: string): string {
  return isoDate.slice(0, 10).replaceAll("-", "");
}

function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// 规范要求每行不超过 75 字节，超出的折行（按 UTF-8 字节计算，不能把汉字切断）
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(events: CalendarEvent[]): string {
  const now = utcStamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Campus Agent//ZH-CN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${event.id}@campus-agent`, `DTSTAMP:${now}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateValue(event.start)}`);
      lines.push(`DTEND;VALUE=DATE:${event.end ? nextDay(event.end) : nextDay(event.start)}`);
    } else {
      const start = new Date(event.start);
      const end = event.end ? new Date(event.end) : new Date(start.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`);
    // 截止日提前一天提醒，其他提前 30 分钟
    const trigger = event.allDay || event.kind === "deadline" ? "-P1D" : "-PT30M";
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(event.title)}`, `TRIGGER:${trigger}`, "END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function downloadIcs(events: CalendarEvent[], filename: string) {
  const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 以北京时间展示日期
export function describeEventTime(event: CalendarEvent) {
  const toBeijing = (iso: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T00:00:00Z`);
    return new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  };
  const start = toBeijing(event.start);
  const month = start.getUTCMonth() + 1;
  const day = start.getUTCDate();
  const weekday = `周${WEEKDAYS[start.getUTCDay()]}`;
  const time = (date: Date) => `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;

  let range = "全天";
  if (!event.allDay) {
    range = time(start);
    if (event.end) range += ` – ${time(toBeijing(event.end))}`;
  } else if (event.end && event.end.slice(0, 10) !== event.start.slice(0, 10)) {
    const end = toBeijing(event.end);
    range = `至 ${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
  }
  return { month, day, weekday, range };
}

export function eventToText(event: CalendarEvent): string {
  const { month, day, weekday, range } = describeEventTime(event);
  return [
    `【${event.title}】`,
    `时间：${month}月${day}日 ${weekday} ${range}`,
    event.location ? `地点：${event.location}` : "",
    event.notes ? `备注：${event.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
