import { z } from "zod";
import { saveFeedback } from "@/lib/server/logs";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  messageId: z.string().min(1).max(64),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  if (!rateLimit(`feedback:${clientIp(req)}`, 60)) {
    return Response.json({ error: "操作太频繁" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "参数不正确" }, { status: 400 });
  }
  saveFeedback(parsed.data.messageId, parsed.data.rating, parsed.data.comment);
  return Response.json({ ok: true });
}
