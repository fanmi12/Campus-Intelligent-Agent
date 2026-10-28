// 检索质量评测：用一组标好答案的问题，检查检索结果对不对、"资料里有没有答案"判断得准不准、耗时多少
//
// 用法：
//   pnpm kb:eval              按当前配置评测，输出汇总
//   pnpm kb:eval --detail     同上，并列出每个问题检索到的前三条资料
//   pnpm kb:eval compare      对比四种配置：只用关键词 / +语义向量 / +重排 / 语义向量+重排（约 5 分钟）
//   pnpm kb:eval keyword|vector|rerank|full   只评测其中一种配置
//
// 问题分三组：「调参题」是调检索规则时用过的问题；「新题」没参与调参（口语化、换说法），更能说明真实效果；
// 「附件题」的答案只在官网正文图片或附件里（pnpm kb:ocr 转写到 knowledge/官网附件/），检查转写的资料能不能被找到，
// 这组题命中的必须是有正文的资料，只命中"正文是图片或附件"的占位页不算对。
// 标准答案是"正确资料的标题要匹配的规则"，都人工核对过资料原文；null 表示资料库里没有答案，应判为资料不足。
// 补充或删改资料后，标准答案可能需要跟着调整。
import { spawnSync } from "node:child_process";
import { ATTACHMENT_ONLY_NOTE } from "../src/lib/server/kb/markdown";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // 文件不存在就跳过
  }
}

type Case = [question: string, expected: RegExp | null];

const TUNING: Case[] = [
  // 2026-10-28 新增人工整理的图书馆、饭堂、宿舍电费、校园网资料，能回答的题目一并认可
  ["图书馆几点开门？", /开放时间|图书馆欢迎您|^图书馆$/],
  ["学校地址在哪？", /学校概况|交通出行|联系我们/],
  ["在校外怎么用知网？", /外网访问|校外访问/],
  ["四六级什么时候报名？", /四、六级考试报名/],
  ["学校有多少个本科专业？", /学校概况|学校简介|学校介绍/],
  // 官网附件/ 转写的《东莞城市学院章程》第十条写了校训（2026-10-13 补充）
  ["校训是什么？", /学校概况|校徽校训|东莞城市学院章程/],
  ["休学要怎么办理？", /休学|常见问题解答/],
  ["2025-2026学年的校历在哪看？", /2025-2026校历/],
  ["宿舍水电费怎么交？", /水、电费|水电费|宿舍报修与电费/],
  ["国家助学金怎么申请？", /助学金|资助|常见问题解答/],
  ["可以转专业吗？", /转专业|高考生/],
  ["学生证丢了怎么补办？", /学生证|常见问题解答/],
  ["心理咨询中心在哪里？", /心理|学生部|学生工作部|常见问题解答/],
  ["学校什么时候有招聘会？", /招聘会|双选会|就业网/],
  ["食堂几点开门？", /饭堂营业时间/],
  ["现任校长是谁？", /现任领导|任我校校长/],
  ["图书馆座位怎么预约？", /座位预约/],
  ["学校有哪些二级学院？", /招生网首页|专业介绍/],
  ["普通话水平测试怎么报名？", null],
  ["毕业论文有什么要求？", /毕业论文（设计）工作的通知/],
  ["学校的详细地址是什么？从东莞站怎么过去？", /交通出行|学校概况/],
  ["那具体怎么操作？", null],
  ["宿舍可以养宠物吗？", /社区安全/],
  // 官网附件/ 转写的 2021-2022 校历作息表里，教学场地列有游泳馆（2026-10-13 补充）
  ["学校有游泳馆吗？", /新校区|校园|2021-2022年学年度校历/],
  ["校园跑腿兼职怎么找？", null],
];

const HOLDOUT: Case[] = [
  ["晚上几点前要回宿舍？", /作息/],
  ["电脑坏了学校有地方修吗？", /技术服务部|校园网与电脑维修/],
  ["怎么查期末成绩？", null],
  ["我想去国外交换，有什么项目？", /交换生|国际交流|学校介绍/],
  ["大一新生要军训多久？", /军训/],
  ["学校的邮编是多少？", /学校概况|概览|联系/],
  ["考试作弊会怎么处理？", null],
  ["图书馆一次能借几本书？", /关于本馆|借阅规则|^图书馆$/],
  ["怎么申请勤工俭学的岗位？", /勤工/],
  ["学校有没有心理老师可以聊聊？", /心理/],
  ["一年学费要交多少钱？", null],
  ["学校在东莞哪个镇？", /学校概况|招生网首页|合作部概览/],
  ["宿舍能用电饭煲吗？", /宿舍|消防/],
  ["学校招研究生吗？", /学校介绍|联合培养/],
  ["饭堂有几个？", /饭堂营业时间/],
  ["上课迟到会怎么样？", null],
  ["怎么开在校证明？", /在校证明|学籍证明/],
  ["学校的WiFi怎么连？", /校园设施|校园网/],
];

const ATTACHMENTS: Case[] = [
  ["2025-2026学年什么时候放寒假？", /2025-2026校历/],
  ["休学要走哪些审批环节？", /休学申请审批流程/],
  ["复学要怎么申请？", /复学申请审批流程/],
  ["退学需要哪些人签字？", /退学申请审批流程/],
  ["辅修的申请流程是怎样的？", /辅修申请审批流程/],
  ["借教室要去哪里办？", /教室借用/],
  ["家里困难交不起学费，可以申请缓交吗？", /绿色通道/],
  ["2024年专升本软件工程一年学费多少？", /2024年专升本新生教育收费标准/],
  ["2024年下半年四六级什么时候报名？", /2024年下半年全国大学英语四、六级考试报名/],
  ["新生的《学生手册》考试是什么时候？", /入学教育/],
];

const SETS = { 调参题: TUNING, 新题: HOLDOUT, 附件题: ATTACHMENTS };
// 这几组命中的资料必须有正文（不能只是"正文是图片或附件"的占位页）
const NEEDS_TEXT = new Set(["附件题"]);
const MODES = {
  keyword: "只用关键词",
  vector: "关键词 + 语义向量",
  rerank: "关键词 + 重排",
  full: "关键词 + 语义向量 + 重排",
} as const;
type Mode = keyof typeof MODES;

type SetSummary = {
  set: string;
  top1: number;
  top3: number;
  answerable: number;
  judged: number;
  total: number;
  median: number;
  p90: number;
  max: number;
};

const args = process.argv.slice(2);
const detail = args.includes("--detail");
const json = args.includes("--json");
const command = args.find((arg) => !arg.startsWith("--"));

const pct = (n: number, d: number) => `${n}/${d}（${Math.round((n / d) * 100)}%）`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function evaluate(): Promise<SetSummary[]> {
  const { searchKnowledge } = await import("../src/lib/server/kb/search");
  const summaries: SetSummary[] = [];
  for (const [set, cases] of Object.entries(SETS)) {
    const times: number[] = [];
    let top1 = 0;
    let top3 = 0;
    let judged = 0;
    for (const [question, expected] of cases) {
      const started = performance.now();
      const result = await searchKnowledge(question);
      const ms = performance.now() - started;
      times.push(ms);
      const correct = (hit: (typeof result.hits)[number]) =>
        Boolean(expected?.test(hit.chunk.docTitle)) && (!NEEDS_TEXT.has(set) || hit.chunk.content !== ATTACHMENT_ONLY_NOTE);
      const hit1 = result.hits.slice(0, 1).some(correct);
      const hit3 = result.hits.slice(0, 3).some(correct);
      const judgedRight = result.lowConfidence === (expected === null);
      top1 += Number(hit1);
      top3 += Number(hit3);
      judged += Number(judgedRight);
      if (detail) {
        const mark = expected ? (hit1 ? "✓" : hit3 ? "△" : "✗") : "·";
        const score = result.topSimilarity === null ? "—" : result.topSimilarity.toFixed(2);
        console.log(
          `\n${mark} ${question}  [${result.lowConfidence ? "资料不足" : "有资料"}${judgedRight ? "" : "，判断错"} · 最高分 ${score} · ${Math.round(ms)}ms]`,
        );
        for (const hit of result.hits.slice(0, 3)) {
          const relevance = hit.relevance === null ? "" : ` 相关度 ${hit.relevance.toFixed(2)}`;
          const placeholder = hit.chunk.content === ATTACHMENT_ONLY_NOTE ? "（占位页）" : "";
          console.log(
            `    ${hit.chunk.kind ?? "资料"} ${hit.chunk.updated ?? "无日期"} 《${hit.chunk.docTitle.slice(0, 32)}》${placeholder}${relevance}`,
          );
        }
      }
    }
    times.sort((a, b) => a - b);
    summaries.push({
      set,
      top1,
      top3,
      answerable: cases.filter(([, expected]) => expected).length,
      judged,
      total: cases.length,
      median: times[Math.floor(times.length / 2)],
      p90: times[Math.floor(times.length * 0.9)],
      max: times.at(-1) ?? 0,
    });
  }
  return summaries;
}

function printSummaries(label: string, summaries: SetSummary[]) {
  for (const s of summaries) {
    console.log(
      `${label.padEnd(16, "　")} ${s.set.padEnd(3, "　")} 第一条就对 ${pct(s.top1, s.answerable).padEnd(11)} 前三条有对的 ${pct(s.top3, s.answerable).padEnd(11)} 有无资料判断对 ${pct(s.judged, s.total).padEnd(11)} 耗时 中位 ${seconds(s.median)} / 九成 ${seconds(s.p90)} / 最慢 ${seconds(s.max)}`,
    );
  }
}

async function main() {
  if (command === "compare") {
    // 每种配置开一个子进程：模型配置在加载时就确定了
    console.log("对比四种检索配置（每种配置把全部问题检索一遍）…\n");
    for (const mode of Object.keys(MODES) as Mode[]) {
      const child = spawnSync(process.execPath, [...process.execArgv, __filename, mode, "--json"], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      const line = child.stdout.split("\n").find((text) => text.startsWith("{"));
      if (child.status !== 0 || !line) {
        console.error(`${MODES[mode]}：评测失败\n${child.stderr.slice(-800)}`);
        continue;
      }
      printSummaries(MODES[mode], (JSON.parse(line) as { summaries: SetSummary[] }).summaries);
    }
    return;
  }

  if (command && command in MODES) {
    if (command === "keyword" || command === "rerank") process.env.EMBEDDING_MODEL = "";
    if (command === "keyword" || command === "vector") process.env.RERANK_MODEL = "";
  } else if (command) {
    console.error(`不认识的参数：${command}。可用：compare、keyword、vector、rerank、full、--detail`);
    process.exit(1);
  }

  const { hasEmbedding, hasRerank } = await import("../src/lib/server/env");
  const label = hasEmbedding && hasRerank ? MODES.full : hasEmbedding ? MODES.vector : hasRerank ? MODES.rerank : MODES.keyword;
  const summaries = await evaluate();
  if (json) {
    console.log(JSON.stringify({ label, summaries }));
  } else {
    console.log(detail ? "" : `检索配置：${label}`);
    printSummaries(label, summaries);
  }
}

main().catch((error) => {
  console.error("评测失败：", error);
  process.exit(1);
});
