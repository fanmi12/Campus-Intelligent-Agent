import { CORE_TOOL_NAMES } from "./tools";

const cardTools = new Set<string>(CORE_TOOL_NAMES);
// 卡片已成功返回后，下一步只组织简短说明，防止模型再次生成同一张卡片。
export function hasCardResult(steps: { toolResults: { toolName: string }[] }[]): boolean {
  return steps.some((step) => step.toolResults.some((result) => cardTools.has(result.toolName)));
}
