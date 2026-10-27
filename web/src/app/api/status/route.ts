import { hasEmbedding, hasVision, hasWebSearch, isDemoMode } from "@/lib/server/env";

export const dynamic = "force-dynamic";

// 前端用来判断是否处于演示模式、是否支持图片
export function GET() {
  return Response.json({
    demo: isDemoMode,
    vision: hasVision,
    semanticSearch: hasEmbedding,
    webSearch: hasWebSearch,
  });
}
