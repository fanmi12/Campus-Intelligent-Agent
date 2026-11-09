import { setTimeout as sleep } from "node:timers/promises";
import type { AgentId } from "@/lib/learn/schema";
import type { GradeResult } from "./grade";

// 演示模式（没配置大模型）下的简答批改、课堂讨论和提问：内容固定或按关键词估算，
// 目的是没有 Key 也能把界面完整走通，方便调样式和截图。

const DEMO_NOTE = "演示模式：分数由关键词估算，仅供参考。";

// 相邻两个字组成的片段，用来比较两段文字有多像（不用分词，中文也能用）
function bigrams(text: string): Set<string> {
  const chars = [...text.replace(/[\s\p{P}\p{S}]/gu, "")];
  const grams = new Set<string>();
  for (let index = 0; index + 1 < chars.length; index++) grams.add(chars[index] + chars[index + 1]);
  return grams;
}

// 按得分点的片段命中率估分：答案里出现了得分点至少 35% 的片段，就算命中这个得分点。
// 答案和参考答案足够像（覆盖参考答案至少一半的片段）时，按覆盖率给分，这样照着参考答案写的满分答案不会被得分点的措辞卡住
export function estimateGrade(rubric: string[], answer: string, reference = ""): GradeResult {
  const given = bigrams(answer);
  let hits: string[] = [];
  let missing: string[] = [];
  for (const item of rubric) {
    const grams = bigrams(item);
    const overlap = grams.size ? [...grams].filter((gram) => given.has(gram)).length / grams.size : 0;
    (overlap >= 0.35 ? hits : missing).push(item);
  }
  let score = rubric.length ? Math.round((hits.length / rubric.length) * 100) : 0;
  const referenceGrams = bigrams(reference);
  const covered = referenceGrams.size ? [...referenceGrams].filter((gram) => given.has(gram)).length / referenceGrams.size : 0;
  if (covered >= 0.5 && Math.round(covered * 100) > score) {
    score = Math.round(covered * 100);
    if (score >= 80) {
      hits = rubric;
      missing = [];
    }
  }
  const feedback =
    score >= 80 ? "答到了主要的得分点，很棒。" : score >= 40 ? "答到了一部分，再补充遗漏的得分点会更完整。" : "和参考答案还有差距，对照得分点再看看。";
  return { score, verdict: score >= 80 ? "correct" : score >= 40 ? "partial" : "incorrect", feedback: `${feedback}${DEMO_NOTE}`, hits: hits.slice(0, 4), missing: missing.slice(0, 4) };
}

const DISCUSS_LINES: Record<AgentId, string> = {
  teacher: "你说到了一个很关键的点。再想一想：换一个场景，这个办法还管用吗？（演示模式：这是固定的示例发言）",
  xiaolin: "我也有类似的经历，比如在宿舍里赶作业，真的很容易被打断。（演示模式：固定的示例发言）",
  xiaomei: "可是为什么一定是这样呢？换一种做法行不行？（演示模式：固定的示例发言）",
};

const ASK_LINE = "这是演示模式的示例回答。接入大模型之后，狮老师会结合这一页的内容，认真回答你的问题。";

// 逐段吐出固定的发言，模拟流式输出
export async function* demoSpeechStream(agent: AgentId, mode: "ask" | "discuss", signal?: AbortSignal): AsyncGenerator<string> {
  const chars = [...(mode === "ask" ? ASK_LINE : DISCUSS_LINES[agent])];
  for (let index = 0; index < chars.length; index += 3) {
    signal?.throwIfAborted();
    await sleep(30);
    yield chars.slice(index, index + 3).join("");
  }
}
