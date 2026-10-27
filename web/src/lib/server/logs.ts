import { getDb } from "./db";

export type QuestionStatus = "open" | "resolved" | "ignored";

export type ChatLogEntry = {
  id: string;
  chatId?: string;
  question: string;
  answer: string;
  topSimilarity: number | null;
  lowConfidence: boolean;
  sourceIds: string[];
  tools: string[];
  hasImage: boolean;
  demo: boolean;
  firstTokenMs: number | null;
};

export function logChat(entry: ChatLogEntry) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO chat_logs
        (id, chat_id, question, answer, top_similarity, low_confidence, source_ids, tools, has_image, demo, first_token_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.id,
      entry.chatId ?? null,
      entry.question.slice(0, 2000),
      entry.answer.slice(0, 8000),
      entry.topSimilarity,
      entry.lowConfidence ? 1 : 0,
      JSON.stringify(entry.sourceIds),
      JSON.stringify(entry.tools),
      entry.hasImage ? 1 : 0,
      entry.demo ? 1 : 0,
      entry.firstTokenMs,
      Date.now(),
    );
}

export function saveFeedback(messageId: string, rating: 1 | -1, comment?: string) {
  getDb()
    .prepare(
      `INSERT INTO feedback (message_id, rating, comment, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`,
    )
    .run(messageId, rating, comment?.slice(0, 500) ?? null, Date.now());
  // 点踩的问题重新进入"待补充"
  if (rating === -1) {
    getDb().prepare("UPDATE chat_logs SET status = 'open' WHERE id = ?").run(messageId);
  }
}

export type QuestionRow = {
  id: string;
  question: string;
  answer: string;
  topSimilarity: number | null;
  lowConfidence: boolean;
  tools: string[];
  hasImage: boolean;
  demo: boolean;
  status: QuestionStatus;
  rating: number | null;
  comment: string | null;
  createdAt: number;
};

type RawQuestionRow = {
  id: string;
  question: string;
  answer: string;
  top_similarity: number | null;
  low_confidence: number;
  tools: string;
  has_image: number;
  demo: number;
  status: QuestionStatus;
  rating: number | null;
  comment: string | null;
  created_at: number;
};

function mapRow(row: RawQuestionRow): QuestionRow {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    topSimilarity: row.top_similarity,
    lowConfidence: row.low_confidence === 1,
    tools: JSON.parse(row.tools) as string[],
    hasImage: row.has_image === 1,
    demo: row.demo === 1,
    status: row.status,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

const SELECT_QUESTIONS = `
  SELECT l.id, l.question, l.answer, l.top_similarity, l.low_confidence, l.tools, l.has_image, l.demo,
         l.status, l.created_at, f.rating, f.comment
  FROM chat_logs l LEFT JOIN feedback f ON f.message_id = l.id`;

// 待补充：资料里没答案的问题 + 被点踩的回答
export function listGaps(limit = 100): QuestionRow[] {
  const rows = getDb()
    .prepare(
      `${SELECT_QUESTIONS}
       WHERE l.status = 'open' AND (
         f.rating = -1
         OR (l.low_confidence = 1 AND l.has_image = 0 AND l.tools NOT LIKE '%addToCalendar%')
       )
       ORDER BY l.created_at DESC LIMIT ?`,
    )
    .all(limit) as RawQuestionRow[];
  return rows.map(mapRow);
}

export function listRecent(limit = 100): QuestionRow[] {
  const rows = getDb()
    .prepare(`${SELECT_QUESTIONS} ORDER BY l.created_at DESC LIMIT ?`)
    .all(limit) as RawQuestionRow[];
  return rows.map(mapRow);
}

export function setQuestionStatus(id: string, status: QuestionStatus) {
  getDb().prepare("UPDATE chat_logs SET status = ? WHERE id = ?").run(status, id);
}

export type DashboardStats = {
  total: number;
  today: number;
  gaps: number;
  likes: number;
  dislikes: number;
  answeredRate: number | null;
  // 近 7 天文字提问的首字时间（毫秒）：中位数和最慢 10% 的门槛
  firstToken: { median: number; p90: number } | null;
  daily: { date: string; count: number }[];
};

export function getStats(): DashboardStats {
  const db = getDb();
  const dayStart = (() => {
    // 北京时间今天 0 点
    const now = Date.now() + 8 * 3600 * 1000;
    return now - (now % 86_400_000) - 8 * 3600 * 1000;
  })();

  const count = (sql: string, ...params: (string | number)[]) =>
    (db.prepare(sql).get(...params) as { n: number }).n;

  const total = count("SELECT COUNT(*) AS n FROM chat_logs");
  const answered = count("SELECT COUNT(*) AS n FROM chat_logs WHERE low_confidence = 0 OR tools LIKE '%addToCalendar%'");
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000 + 8 * 3600, 'unixepoch') AS date, COUNT(*) AS count
       FROM chat_logs WHERE created_at >= ? GROUP BY date ORDER BY date`,
    )
    .all(dayStart - 13 * 86_400_000) as { date: string; count: number }[];
  // 补齐最近 14 天（北京时间），没有提问的日子记为 0
  const daily = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(dayStart + 8 * 3600 * 1000 - (13 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, count: rows.find((row) => row.date === date)?.count ?? 0 };
  });

  // 带图片的提问要先识图，单独慢一截，不计入
  const latencies = (db
    .prepare(
      `SELECT first_token_ms AS ms FROM chat_logs
       WHERE first_token_ms IS NOT NULL AND has_image = 0 AND demo = 0 AND created_at >= ? ORDER BY ms`,
    )
    .all(dayStart - 6 * 86_400_000) as { ms: number }[]).map((row) => row.ms);
  const quantile = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];

  return {
    total,
    today: count("SELECT COUNT(*) AS n FROM chat_logs WHERE created_at >= ?", dayStart),
    firstToken: latencies.length ? { median: quantile(0.5), p90: quantile(0.9) } : null,
    gaps: listGaps(1000).length,
    likes: count("SELECT COUNT(*) AS n FROM feedback WHERE rating = 1"),
    dislikes: count("SELECT COUNT(*) AS n FROM feedback WHERE rating = -1"),
    answeredRate: total ? answered / total : null,
    daily,
  };
}
