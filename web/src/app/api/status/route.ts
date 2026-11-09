import { DISCUSSION_ENABLED } from "@/lib/server/learn/prompts";
import { env, hasEmbedding, hasVision, hasWebSearch, isDemoMode } from "@/lib/server/env";

export const dynamic = "force-dynamic";

// 前端用来判断是否处于演示模式、是否支持图片，以及小狮课堂是否开放
export function GET() {
  return Response.json({
    demo: isDemoMode,
    vision: hasVision,
    semanticSearch: hasEmbedding,
    webSearch: hasWebSearch,
    // tts：讲解朗读用浏览器自带的语音（有服务端语音时为 "server"，见计划 Phase 4B）
    learn: { enabled: env.learn.enabled, discussion: DISCUSSION_ENABLED, tts: "browser" },
  });
}
