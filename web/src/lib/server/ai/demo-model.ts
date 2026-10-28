import type { LanguageModelV4, LanguageModelV4StreamPart, LanguageModelV4Usage } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { site } from "@/lib/config";
import { starterStudy } from "@/lib/campus-study";
import { beijingNow, NO_ANSWER_REPLY, type PromptSource } from "./prompt";

// 演示模式：没配置大模型 Key 时用它代替，让界面、检索、工具卡片都能完整跑通。
// 它不会真的理解问题，只是摘录检索到的资料、用正则从通知里抠时间。

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

const DEMO_NOTE = "\n\n> 演示模式：还没接入大模型，这是程序模拟的回复。配置 `LLM_API_KEY` 后就是真正的智能回答。";

function textParts(text: string): LanguageModelV4StreamPart[] {
  const chars = Array.from(text);
  const parts: LanguageModelV4StreamPart[] = [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "demo-text" },
  ];
  for (let i = 0; i < chars.length; i += 3) {
    parts.push({ type: "text-delta", id: "demo-text", delta: chars.slice(i, i + 3).join("") });
  }
  parts.push(
    { type: "text-end", id: "demo-text" },
    { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: USAGE },
  );
  return parts;
}

const pad = (value: number) => String(value).padStart(2, "0");

// 从"10月20日下午2点在图书馆报告厅开新生安全讲座，记得带学生证"这类句子里抠出日程
function extractEvent(text: string, now: Date) {
  const today = beijingNow(now);
  const dateMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  const weekMatch = text.match(/(下|本|这)\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
  const timeMatch = text.match(/(上午|早上|中午|下午|晚上)?\s*(\d{1,2})\s*(?:[点时:：])\s*(半|\d{1,2})?/);

  let year = today.year;
  let month = today.month;
  let day = today.day + 3;
  if (dateMatch) {
    month = Number(dateMatch[1]);
    day = Number(dateMatch[2]);
    // 日期已经过去两个月以上，多半说的是明年
    if (month < today.month - 2) year += 1;
  } else if (weekMatch) {
    // "下周三""本周五"：一周从周一算起，超出本月的天数由 Date.UTC 自动进位
    const todayIndex = (new Date(Date.UTC(year, month - 1, today.day)).getUTCDay() + 6) % 7;
    const target = weekMatch[2] === "天" ? 6 : "一二三四五六日".indexOf(weekMatch[2]);
    day = today.day + target - todayIndex + (weekMatch[1] === "下" ? 7 : 0);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const isoDate = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

  let start = isoDate;
  let allDay = true;
  if (timeMatch) {
    let hour = Number(timeMatch[2]);
    if (["下午", "晚上"].includes(timeMatch[1] ?? "") && hour < 12) hour += 12;
    const minute = timeMatch[3] === "半" ? 30 : Number(timeMatch[3] ?? 0);
    start = `${isoDate}T${pad(hour)}:${pad(minute)}:00+08:00`;
    allDay = false;
  }

  const title =
    text.match(/(?:开|举行|举办|召开|参加)([^，。,；;！!]{2,20})/)?.[1] ??
    text.match(/([^，。,：:；;]{2,16}?)(?:截止|报名)/)?.[0] ??
    text.replace(/^.*[：:]/, "").slice(0, 16);
  const location = text.match(/在([^，。,；;]{2,15}?)(?:开|举行|举办|召开|进行|集合|参加)/)?.[1];
  const notes = text.match(/(?:带|携带)([^，。,；;！!]{1,20})/)?.[0];

  return {
    title: title.trim(),
    start,
    allDay,
    ...(location ? { location } : {}),
    ...(notes ? { notes } : {}),
    kind: /截止|报名/.test(text) ? "deadline" : "event",
  };
}

export function createDemoModel({
  sources,
  lowConfidence,
}: {
  sources: PromptSource[];
  lowConfidence: boolean;
}): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "demo",
    modelId: "demo",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("演示模型只支持流式输出");
    },
    async doStream(options) {
      const prompt = options.prompt;
      const last = prompt[prompt.length - 1];
      let parts: LanguageModelV4StreamPart[];

      if (last?.role === "tool") {
        const name = last.content.find((part) => part.type === "tool-result")?.toolName;
        const replies: Record<string, string> = {
          showCampusMap: "地点卡片已经整理好了。点「去这里」，在高德确认目的地后即可导航。",
          recommendCampusFood: "可以在菜单里调整预算和餐食类型。价格是历史参考，当前情况以门店为准。",
          buildChecklist: "清单整理好了，可以勾选并下载自己的完成记录。勾选不会提交审批。",
          buildStudyCards: "复习卡准备好了，可以翻面记忆，再做小测验。",
          showContactCard: "联系卡整理好了，可以复制电话或保存联系人。",
          buildExamMemo: "考试备忘整理好了，导出的日历文件还需要自行导入日历。",
        };
        parts = textParts(`${replies[name ?? ""] ?? "日程卡片已经生成好了，点「加入日历」可以导出日历文件。"}${DEMO_NOTE}`);
      } else {
        const userText =
          last?.role === "user"
            ? last.content.map((part) => (part.type === "text" ? part.text : "")).join("\n")
            : "";
        const canUseCalendar = options.tools?.some((t) => t.name === "addToCalendar");
        const canUse = (name: string) => options.tools?.some((tool) => tool.name === name);
        const call = (toolName: string, input: unknown): LanguageModelV4StreamPart[] => [
          { type: "stream-start", warnings: [] },
          { type: "tool-call", toolCallId: `demo-${toolName}-${Date.now().toString(36)}`, toolName, input: JSON.stringify(input) },
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: USAGE },
        ];
        const canUseMap = options.tools?.some((t) => t.name === "showCampusMap");
        const placeName = userText.match(/图书馆|荔香园|悦香园|东莞城市学院/)?.[0]
          ?? (/学校|城院/.test(userText) ? site.school : undefined);

        if (/课表|课程安排/.test(userText)) {
          parts = textParts(`目前还没有接入真实课表数据，暂时不能查询或生成个人课表。${DEMO_NOTE}`);
        } else if (canUse("recommendCampusFood") && /吃什么|美食|餐食|饭堂|食堂.*推荐|预算.*[元块]/.test(userText)) {
          parts = call("recommendCampusFood", { budget: Number(userText.match(/(\d{1,3})\s*[元块]/)?.[1] ?? 20), category: /面食|想吃面/.test(userText) ? "面食" : /米饭/.test(userText) ? "米饭" : "全部" });
        } else if (canUse("buildStudyCards") && /单词|词汇|背英语|复习英语/.test(userText)) {
          parts = call("buildStudyCards", starterStudy);
        } else if (canUse("showContactCard") && /招生.*(?:电话|联系)|(?:电话|联系).*招生/.test(userText)) {
          const source = sources.find((source) => /招生热线/.test(source.content));
          const line = source?.content.split("\n").find((line) => /招生热线/.test(line)) ?? "";
          const numbers = [...line.matchAll(/0\d{2,3}[-\s]?\d{7,8}/g)].map((match) => match[0]);
          parts = source && numbers.length ? call("showContactCard", { name: "招生咨询", organization: site.school, phones: numbers.map((number) => ({ label: "招生热线", number })), basis: "sources", sourceNumbers: [source.n] }) : textParts(`没有找到可靠的招生电话资料，请先提供官网信息。${DEMO_NOTE}`);
        } else if (canUse("buildChecklist") && /复学|办理.*清单|办事流程/.test(userText)) {
          const source = sources.find((source) => /复学申请审批流程/.test(source.title) && /^\d+[.、]\s*.+$/m.test(source.content));
          const numbered = source ? [...source.content.matchAll(/^\d+[.、]\s*(.+)$/gm)] : [];
          parts = source && numbered.length ? call("buildChecklist", { title: source.title, steps: numbered.slice(0, 12).map((match) => ({ title: match[1].slice(0, 100), detail: match[1].slice(0, 500) })), basis: "sources", sourceNumbers: [source.n] }) : textParts(`当前资料还不足以整理完整流程，请提供办理通知或原文。${DEMO_NOTE}`);
        } else if (canUse("buildExamMemo") && /考试/.test(userText)) {
          parts = /\d{1,2}月\d{1,2}[日号]/.test(userText) ? call("buildExamMemo", { event: { ...extractEvent(userText, new Date()), kind: "exam" }, checklist: [], basis: "user", sourceNumbers: [] }) : textParts(`请提供考试通知或明确的考试日期，再为你生成备忘卡。${DEMO_NOTE}`);
        } else if (canUseCalendar && /(通知|截止|报名|日历|提醒|讲座|会议|活动)/.test(userText)) {
          parts = [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: `demo-${Date.now().toString(36)}`,
              toolName: "addToCalendar",
              input: JSON.stringify({ events: [extractEvent(userText, new Date())] }),
            },
            { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: USAGE },
          ];
        } else if (canUseMap && placeName && /在哪|哪里|怎么走|怎么去|过去|导航|带我去|地址/.test(userText)) {
          parts = [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call", toolCallId: `demo-map-${Date.now().toString(36)}`, toolName: "showCampusMap",
              input: JSON.stringify({ places: [{ name: placeName, kind: /图书馆/.test(placeName) ? "library" : /香园/.test(placeName) ? "dining" : "campus" }] }),
            },
            { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: USAGE },
          ];
        } else if (/^\s*(你好|您好|hi|hello|嗨|在吗)/i.test(userText)) {
          parts = textParts(
            `你好！我是${site.name}，可以帮你查校园资料，也能把通知一键加进手机日历。有什么想问的？${DEMO_NOTE}`,
          );
        } else if (sources.length && !lowConfidence) {
          // 按整行截取，避免把列表、网址切断
          const clip = (content: string) => {
            const lines: string[] = [];
            for (const line of content.split("\n")) {
              if (lines.length && lines.join("\n").length + line.length > 120) break;
              lines.push(line);
            }
            return lines.join("\n").trim();
          };
          const excerpt = sources
            .slice(0, 2)
            .map((source) => `${clip(source.content)} [${source.n}]`)
            .join("\n\n");
          parts = textParts(`我在校园资料里找到了这些相关内容：\n\n${excerpt}${DEMO_NOTE}`);
        } else {
          parts = textParts(
            `${NO_ANSWER_REPLY}。问题已经记下来了，补充资料后就能回答。${DEMO_NOTE}`,
          );
        }
      }

      return {
        stream: simulateReadableStream({ chunks: parts, initialDelayInMs: 400, chunkDelayInMs: 16 }),
      };
    },
  };
}
