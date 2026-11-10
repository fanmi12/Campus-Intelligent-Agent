import type { QueueOwner } from "../chat-queue";
import { env } from "../env";
import { clientIp } from "../rate-limit";

// 小狮课堂接口的公共小工具：统一的错误格式（{ error: "中文短句" }）、不缓存、总开关、浏览器标识

// 浏览器标识：和聊天一样，匿名、只用于限额和「创建者才能删除」，不关联身份
export const CLIENT_ID = /^[\w-]{8,64}$/;

const NO_STORE = { "Cache-Control": "no-store" };

export function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function fail(error: string, status: number): Response {
  return reply({ error }, status);
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

// 总开关：LEARN_ENABLED=false 时所有接口一律 403
export function disabled(): Response | null {
  return env.learn.enabled ? null : fail("小狮课堂暂未开放", 403);
}

export function clientIdOf(req: Request): string | null {
  const id = req.headers.get("x-client-id");
  return id && CLIENT_ID.test(id) ? id : null;
}

export function ownerOf(req: Request): QueueOwner | null {
  const client = clientIdOf(req);
  return client ? { client, ip: clientIp(req) } : null;
}

// 校验失败时给同学看的第一条提示：只用中文的，其他统一说请求格式不对
export function firstMessage(issues: { message: string }[]): string {
  const message = issues[0]?.message ?? "";
  return /[一-鿿]/.test(message) ? message : "请求格式不正确";
}
