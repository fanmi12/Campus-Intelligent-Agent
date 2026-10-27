import { env } from "@/lib/server/env";

const endpoints = new Map([
  ["v3/log/init", "https://restapi.amap.com/v3/log/init"],
  ["v3/place/text", "https://restapi.amap.com/v3/place/text"],
  ["v3/place/detail", "https://restapi.amap.com/v3/place/detail"],
  ["v4/map/styles", "https://webapi.amap.com/v4/map/styles"],
  ["v4/map/styleslite", "https://webapi.amap.com/v4/map/styleslite"],
]);

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const endpoint = endpoints.get((await context.params).path.join("/"));
  if (!endpoint) return Response.json({ error: "Unsupported map service" }, { status: 404 });
  const { key, securityCode } = env.amap;
  if (!key || !securityCode) return Response.json({ error: "Map is not configured" }, { status: 503 });
  const query = new URL(request.url).searchParams;
  const callback = query.get("callback");
  if (query.toString().length > 4096 || query.getAll("callback").length > 1 ||
      (callback && !/^[$A-Z_a-z][\w$]*(?:\.[$A-Z_a-z][\w$]*)*$/.test(callback))) {
    return Response.json({ error: "Invalid map request" }, { status: 400 });
  }
  const upstream = new URL(endpoint);
  for (const [name, value] of query) {
    if (name !== "key" && name !== "jscode") upstream.searchParams.append(name, value);
  }
  upstream.searchParams.set("key", key);
  upstream.searchParams.set("jscode", securityCode);
  try {
    const response = await fetch(upstream, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Map upstream unavailable");
    const body = (await response.text()).replaceAll(securityCode, "[redacted]");
    return new Response(body, { headers: {
      "Content-Type": callback ? "application/javascript; charset=utf-8" : (response.headers.get("content-type") ?? "application/json"),
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return Response.json({ error: "Map service unavailable" }, { status: 502 });
  }
}
