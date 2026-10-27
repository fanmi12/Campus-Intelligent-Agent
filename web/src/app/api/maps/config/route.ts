import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export function GET() {
  const enabled = Boolean(env.amap.key && env.amap.securityCode);
  // JS API Key 本来就用于浏览器加载 SDK；配套的安全密钥始终留在服务端。
  return Response.json({ enabled, key: enabled ? env.amap.key : undefined }, {
    headers: { "Cache-Control": "no-store" },
  });
}
