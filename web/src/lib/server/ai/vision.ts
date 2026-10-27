import { generateText } from "ai";
import { getVisionModel } from "./models";

export type ImageInput = { mediaType: string; url: string };

export type ReadImagesOptions = {
  // 给识图模型的要求；默认是聊天里用的"转写文字 + 一句话说明是什么图片"
  instruction?: string;
  maxOutputTokens?: number;
};

const DEFAULT_INSTRUCTION =
  "请完整转写图片中的全部文字，保持原有分行，表格用 | 分隔；然后另起一行，用一句话说明这是什么图片。不要补充图片里没有的信息。";

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  return match ? { mediaType: match[1], data: match[2] } : null;
}

// 先用识图模型把图片转成文字，再交给对话模型：这样对话模型不需要支持图片，换模型也不受影响
export async function readImages(
  images: ImageInput[],
  abortSignal?: AbortSignal,
  { instruction = DEFAULT_INSTRUCTION, maxOutputTokens = 2000 }: ReadImagesOptions = {},
): Promise<string> {
  const model = getVisionModel();
  if (!model) throw new Error("未配置识图模型（VISION_MODEL）");

  const files = images.map((image) => parseDataUrl(image.url)).filter((file) => file !== null);
  if (!files.length) throw new Error("图片格式不正确");

  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          ...files.map((file) => ({ type: "file" as const, mediaType: file.mediaType, data: file.data })),
          { type: "text" as const, text: instruction },
        ],
      },
    ],
    maxOutputTokens,
    temperature: 0,
    abortSignal,
  });
  return text.trim();
}
