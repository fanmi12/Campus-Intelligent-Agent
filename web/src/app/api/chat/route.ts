import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type FileUIPart,
} from "ai";
import { CORE_TOOL_NAMES, tools, type AppTools } from "@/lib/ai/tools";
import { hasCardResult } from "@/lib/ai/tool-flow";
import type { AppUIMessage, SourceItem } from "@/lib/ai/types";
import { createDemoModel } from "@/lib/server/ai/demo-model";
import { getChatModel } from "@/lib/server/ai/models";
import { buildInstructions, isNoAnswerReply, type PromptSource } from "@/lib/server/ai/prompt";
import { readImages } from "@/lib/server/ai/vision";
import { createChatTools } from "@/lib/server/ai/web-tools";
import { hasVision, hasWebSearch, isDemoMode } from "@/lib/server/env";
import { ensureKnowledgeIndexed } from "@/lib/server/kb/ingest";
import { searchKnowledge } from "@/lib/server/kb/search";
import { logChat } from "@/lib/server/logs";
import { chatQueue, ChatQueueError, type QueueOwner } from "@/lib/server/chat-queue";
import { clientIp } from "@/lib/server/rate-limit";

const MAX_HISTORY = 16;
const MAX_IMAGES = 3;
const CLIENT_ID = /^[\w-]{8,64}$/;
const SMALL_TALK = /^\s*(你好|您好|hi|hello|嗨|在吗|谢谢|多谢|好的|ok|嗯+|哈+)[\s!！。.~～？?]*$/i;

function textOf(message: AppUIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

function imagesOf(message: AppUIMessage): FileUIPart[] {
  return message.parts.filter(
    (part): part is FileUIPart => part.type === "file" && part.mediaType.startsWith("image/"),
  );
}

// 追问：以"那、这个、具体……"开头，或者去掉标点只剩几个字（如"几点开门？""图书馆呢？"）
function isFollowUp(question: string): boolean {
  const content = question.replace(/[\s\p{P}]/gu, "");
  return /^(那|那么|这个|那个|它|这|还有|然后|具体|另外|如果)/.test(content) || content.length <= 4 || /呢$/.test(content);
}

// 检索：追问先带上上一句一起查；其他问题先只用这一句查，查不到再带上上一句重查。
// 这样"那具体怎么操作？"能接上上文，换了话题的新问题也不会被上一句带偏
async function retrieve(messages: AppUIMessage[], question: string, visionText?: string) {
  const vision = visionText ? `\n${visionText.slice(0, 400)}` : "";
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map(textOf)
    .filter(Boolean);
  const previous = userTexts.length >= 2 ? userTexts[userTexts.length - 2] : "";
  const alone = () => searchKnowledge(`${question}${vision}`);
  const withContext = () => searchKnowledge(`${previous}\n${question}${vision}`);

  if (previous && isFollowUp(question)) {
    const result = await withContext();
    return result.lowConfidence ? alone() : result;
  }
  const result = await alone();
  if (!result.lowConfidence || !previous) return result;
  const retry = await withContext();
  return retry.lowConfidence ? result : retry;
}

// 发给对话模型前，把图片替换成识图结果（历史图片的识别结果保存在紧随其后的助手消息里）
function prepareForModel(messages: AppUIMessage[], latestVision?: string): AppUIMessage[] {
  return messages.map((message, index) => {
    if (message.role !== "user") return message;
    const images = imagesOf(message);
    if (!images.length) return message;

    let recognized: string | undefined;
    if (index === messages.length - 1) {
      recognized = latestVision;
    } else {
      const reply = messages.slice(index + 1).find((m) => m.role === "assistant");
      const vision = reply?.parts.find((part) => part.type === "data-vision");
      recognized = vision?.type === "data-vision" ? vision.data.text : undefined;
    }
    const note = recognized
      ? `[用户发来 ${images.length} 张图片，识别出的内容如下]\n${recognized}`
      : `[用户发来 ${images.length} 张图片，但没能识别出内容]`;
    return {
      ...message,
      parts: [...message.parts.filter((part) => part.type !== "file"), { type: "text", text: note }],
    };
  });
}

function toolsUsed(message: AppUIMessage): string[] {
  return [
    ...new Set(
      message.parts.filter((part) => part.type.startsWith("tool-")).map((part) => part.type.slice(5)),
    ),
  ];
}

export async function POST(req: Request) {
  const started = Date.now();
  const cancellation = new AbortController();
  const signal = AbortSignal.any([req.signal, cancellation.signal]);

  let payload: { id?: unknown; messages?: unknown };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const validated = await safeValidateUIMessages<AppUIMessage>({ messages: payload.messages, tools });
  if (!validated.success) {
    return Response.json({ error: "消息格式不正确" }, { status: 400 });
  }

  const messages = validated.data.slice(-MAX_HISTORY);
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    return Response.json({ error: "缺少用户消息" }, { status: 400 });
  }

  const chatId = typeof payload.id === "string" ? payload.id.slice(0, 64) : undefined;
  const question = textOf(latest);
  const images = imagesOf(latest).slice(0, MAX_IMAGES);
  if (!question && !images.length) {
    return Response.json({ error: "消息不能为空" }, { status: 400 });
  }

  // 排队按浏览器计数，同一个 Wi-Fi 出口的同学互不影响；没带标识的旧页面按对话计
  const headerId = req.headers.get("x-client-id");
  const owner: QueueOwner = {
    client: headerId && CLIENT_ID.test(headerId) ? headerId : chatId ?? clientIp(req),
    ip: clientIp(req),
  };
  const refused = chatQueue.check(owner);
  if (refused) return Response.json({ error: refused }, { status: 429 });

  await ensureKnowledgeIndexed().catch((error) => console.error("[kb] 自动导入失败", error));

  let sources: SourceItem[] = [];
  let topSimilarity: number | null = null;
  let lowConfidence = true;
  // 耗时（毫秒，从收到请求算起）：检索完成、回答出现第一个字
  let searchedAt: number | null = null;
  let firstTokenAt: number | null = null;

  const stream = createUIMessageStream<AppUIMessage>({
    originalMessages: messages,
    generateId,
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageMetadata: { createdAt: Date.now(), demo: isDemoMode } });

      const release = await chatQueue.acquire(signal, (data) => {
        writer.write({ type: "data-queue", id: "queue", data });
      }, owner);
      const heartbeat = setInterval(() => {
        writer.write({ type: "data-queue", id: "queue-heartbeat", data: { status: "running", position: 0, waiting: 0, active: 0 }, transient: true });
      }, 15_000);
      const workSignal = AbortSignal.any([signal, AbortSignal.timeout(90_000)]);
      try {
      workSignal.throwIfAborted();
      // 1. 识图：把通知截图、海报转成文字
      let visionText: string | undefined;
      if (images.length) {
        const count = images.length;
        writer.write({ type: "data-vision", id: "vision", data: { status: "loading", images: count } });
        try {
          if (!hasVision) throw new Error("未配置识图模型");
          visionText = await readImages(images, workSignal);
          writer.write({ type: "data-vision", id: "vision", data: { status: "done", images: count, text: visionText } });
        } catch (error) {
          console.error("[vision]", error);
          writer.write({ type: "data-vision", id: "vision", data: { status: "error", images: count } });
        }
      }

      // 2. 检索校园资料
      const search = await retrieve(messages, question, visionText);
      searchedAt = Date.now() - started;
      topSimilarity = search.topSimilarity;
      lowConfidence = search.lowConfidence;
      sources = search.hits.map((hit, i) => ({
        n: i + 1,
        id: hit.chunk.id,
        title: hit.chunk.docTitle,
        heading: hit.chunk.heading || undefined,
        snippet: hit.chunk.content.length > 600 ? `${hit.chunk.content.slice(0, 600)}…` : hit.chunk.content,
        url: hit.chunk.sourceUrl ?? undefined,
        updated: hit.chunk.updated ?? undefined,
        kind: "knowledge",
      }));
      if (sources.length) {
        writer.write({ type: "data-sources", id: "sources", data: { items: sources, lowConfidence } });
      }

      // 3. 生成回答（必要时调用工具）
      const promptSources: PromptSource[] = search.hits.map((hit, i) => ({
        n: i + 1,
        title: hit.chunk.docTitle,
        heading: hit.chunk.heading || undefined,
        updated: hit.chunk.updated ?? undefined,
        content: hit.chunk.content,
      }));
      const result = streamText({
        model: getChatModel() ?? createDemoModel({ sources: promptSources, lowConfidence }),
        instructions: buildInstructions({ sources: promptSources, lowConfidence, webSearch: hasWebSearch }),
        messages: await convertToModelMessages(prepareForModel(messages, visionText), {
          tools,
          ignoreIncompleteToolCalls: true,
        }),
        tools: createChatTools({
          question, sources, signal: workSignal,
          userEvidence: prepareForModel(messages, visionText).filter((message) => message.role === "user").map(textOf).join("\n"),
          sourceContents: new Map(promptSources.map((source) => [source.n, source.content])),
          onSources: (trustedResult) => {
            if (trustedResult) lowConfidence = false;
            writer.write({ type: "data-sources", id: "sources", data: { items: [...sources], lowConfidence } });
          },
          onProgress: (id, data) => writer.write({ type: "data-webSearch", id, data }),
        }),
        activeTools: hasWebSearch ? [...CORE_TOOL_NAMES, "searchWeb", "readWebPage"] : [...CORE_TOOL_NAMES],
        stopWhen: isStepCount(6),
        // 卡片完成后或最后一步只整理回答，避免重复卡片或只留下工具结果。
        prepareStep: ({ steps, stepNumber }) => hasCardResult(steps) || stepNumber >= 5 ? { activeTools: [], toolChoice: "none" as const } : {},
        temperature: 0.3,
        abortSignal: workSignal,
        onChunk: ({ chunk }) => {
          if (firstTokenAt === null && (chunk.type === "text-delta" || chunk.type === "tool-input-start")) {
            firstTokenAt = Date.now() - started;
          }
        },
      });

      const output = toUIMessageStream<AppTools, AppUIMessage>({
          stream: result.stream,
          sendStart: false,
          onEnd: ({ outcome }) => writer.setOutcome(outcome),
        });
      const reader = output.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write(value);
        }
      } finally { reader.releaseLock(); }
      } finally { clearInterval(heartbeat); release(); }
    },
    onError: (error) => {
      console.error("[chat]", error);
      return error instanceof ChatQueueError ? error.message : "抱歉，服务暂时出了点问题，请稍后再试。";
    },
    onEnd: ({ responseMessage }) => {
      console.log(
        `[chat] 检索 ${searchedAt ?? "-"}ms · 首字 ${firstTokenAt ?? "-"}ms · 全程 ${Date.now() - started}ms · ${sources.length} 条资料${lowConfidence ? "（相关度低）" : ""}${images.length ? " · 含图片" : ""}`,
      );
      try {
        const answer = textOf(responseMessage);
        logChat({
          id: responseMessage.id,
          chatId,
          question: question || "[图片]",
          answer,
          topSimilarity,
          // 检索没找到，或者找到了但大模型读完认为答不了，都算资料缺失
          lowConfidence: (lowConfidence || isNoAnswerReply(answer)) && !SMALL_TALK.test(question),
          sourceIds: sources.map((source) => source.id),
          tools: toolsUsed(responseMessage),
          hasImage: images.length > 0,
          demo: isDemoMode,
          firstTokenMs: firstTokenAt,
        });
      } catch (error) {
        console.error("[log]", error);
      }
    },
  });

  // 禁止中间的代理压缩响应，否则流式输出会被攒到最后才一次性返回
  const response = createUIMessageStreamResponse({ stream, headers: { "Content-Encoding": "none" } });
  const reader = response.body!.getReader();
  return new Response(new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close(); else controller.enqueue(value);
      } catch (error) { cancellation.abort(); controller.error(error); }
    },
    async cancel(reason) { cancellation.abort(); await reader.cancel(reason); },
  }), { headers: response.headers });
}
