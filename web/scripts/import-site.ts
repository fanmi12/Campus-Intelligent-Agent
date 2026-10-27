// 把从学校官网抓取的资料（每个页面一个 .md）清洗成知识库格式，输出到 knowledge/官网/
// 用法：pnpm kb:import-site <抓取资料所在文件夹> [输出文件夹，默认 knowledge/官网]
//
// 清洗内容：去掉面包屑导航、侧边菜单、作者/审核等页头信息，"上一篇/相关新闻/版权所有"等页尾，
// 把网页里被拆碎的行（如"2024 / 年 / 11 / 月"）拼回完整句子，跳过文章列表页、空页面和重复页面。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ATTACHMENT_ONLY_NOTE } from "../src/lib/server/kb/markdown";

const sourceDir = process.argv[2] ? path.resolve(process.argv[2]) : "";
const outputDir = path.resolve(process.argv[3] ?? "knowledge/官网");
if (!sourceDir || !fs.existsSync(sourceDir)) {
  console.error("用法：pnpm kb:import-site <抓取资料所在文件夹> [输出文件夹]");
  process.exit(1);
}

// 栏目类型：资料（长期有效）、通知（有时效）、新闻（检索时降权）
const KIND_BY_CATEGORY: Record<string, "资料" | "通知" | "新闻"> = {
  通知公告: "通知",
  科研处: "通知",
  学校要闻: "新闻",
  党建思政: "新闻",
  城院人: "新闻",
  党建网: "新闻",
  网络电视台: "新闻",
};

// 栏目只能粗分，再按标题细分：会议、活动报道算新闻（"关于举办……的通知"仍是通知）；
// 校历、规章、流程、指南这类长期有效的算资料
const NEWS_TITLE = /召开|举行|举办|开展|顺利|圆满|成功|走访|调研|莅临|座谈|签约|揭牌|开幕|闭幕|落幕|荣获|喜获|斩获|获评/;
const NOTICE_TITLE = /通知|公告|公示|通告|启事|简章|指南|须知/;
const REFERENCE_TITLE = /校历|作息时间|办事指南|流程|指南|须知|办法|规定|细则|章程|手册/;

function kindOf(category: string, title: string): Doc["kind"] {
  const kind = KIND_BY_CATEGORY[category] ?? "资料";
  if (kind === "新闻") return kind;
  if (REFERENCE_TITLE.test(title)) return "资料";
  if (NEWS_TITLE.test(title) && !NOTICE_TITLE.test(title)) return "新闻";
  return kind;
}

const ZERO_WIDTH = /[​-‍﻿]/g;
const MARKER_WITH_VALUE = /^(作者|审核|发文单位|供稿单位|撰稿|编辑|摄影|浏览次数|更新时间|发布时间|发布日期)[：:]$/;
const MARKER_INLINE = /^(作者|审核|发文单位|供稿单位|文章来源|来源|点击数|发布时间|发布日期|更新时间|当前位置|浏览次数|阅读次数|栏目|浏览)[：:]/;
const DATE_LINE = /^\d{4}[-./年]\d{1,2}(?:[-./月]\d{1,2}日?)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)?$/;
const NAV_LINE = /^(>|>>|›|»|\||首页|网站首页|部门首页|学校首页|设为主页|收藏网页|ARTICLE)$/;
const FOOTER_LINE =
  /^(上一篇|下一篇|上一条|下一条|上一页|下一页|返回|返回列表|返回新闻公告|相关新闻|相关文章|相关阅读|打印本页|关闭窗口|【打印本页】|【关闭窗口】|分享到|扫一扫|学院链接|友情链接|Copyright)[：:]?/i;
const FOOTER_ANYWHERE = /(版[权板]所有|技术支持[：:]|ICP备|一审[：:]|初审[：:])/;
const ICON_SNAKE = /(?<=^|[\s㐀-鿿›>|])[a-z]+(?:_[a-z]+)+(?=$|[\s㐀-鿿])/g;
const ICON_ONLY_LINE = /^(map|support|search|schedule|menu|home|info|event|help|访问资源|全部)$/;
const SITE_SUFFIX =
  /\s*([｜|\-—,，]\s*)(东莞城市学院[^｜|,，]*|中国共产党东莞城市学院委员会)\s*$/;
const GENERIC_TITLE =
  /^(东莞城市学院教务处（原东莞理工学院城市学院教务处）|东莞城市学院--科研部|东莞城市学院人力资源部|东莞城市学院学生部|东莞城市学院网络电视台|中国共产党东莞城市学院委员会|东莞城市学院图书馆)$|^(学院介绍|通知公告|热点问答|政策法规|新闻动态|就业指南|就业公告|校友公告|党建工作|新闻公告|电子资源|事务管理|心理健康|思政建设|一周动态|办事指南|资料下载|专题专栏|党建引领|面对面|新闻播报|美丽城院|党委简介|理论学习|党建制度|党校培训)$/;
const LIST_URL = /newslist\.php|\/front\/category\/|\/Home\/New\/index\/|^https?:\/\/[^/]+\/?(index\.php)?$|\/news\/$|\/party-building\/$/;

// 拼行规则
const TERMINAL = /([。！？!?；;…]|[。！？!?][”"』」）)])$/;
const LIST_START =
  /^(\d{1,2}[.、．)）]|[（(]\d{1,2}[）)]|[一二三四五六七八九十]{1,3}[、.．]|[（(][一二三四五六七八九十]{1,3}[）)]|[①-⑳]|第[一二三四五六七八九十百\d]+[章节条款部分]|[•·▪◆■●○◇□])/;
const JOIN_TAIL = /[\dA-Za-z%．.、，,：:（(“"‘'·\-—/]$/;
const JOIN_HEAD = /^([，。、；：）)”’%,.;:!?！？\d/]|[年月日号时分秒元万亿个名人项次届期位所级家篇份]|[“"‘《](?!.*[。！？]$))/;

type Doc = {
  category: string;
  kind: "资料" | "通知" | "新闻";
  title: string;
  url?: string;
  date?: string;
  paragraphs: string[];
};

const stats = new Map<string, Record<string, number>>();
const bump = (category: string, key: string) => {
  const entry = stats.get(category) ?? {};
  entry[key] = (entry[key] ?? 0) + 1;
  stats.set(category, entry);
};

function normalizeTitle(title: string) {
  return title.replace(ZERO_WIDTH, "").replace(/\s+/g, "").trim();
}

function joinLines(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let buffer = "";
  for (const line of lines) {
    if (!buffer) {
      buffer = line;
      continue;
    }
    const join =
      !TERMINAL.test(buffer) &&
      !LIST_START.test(line) &&
      (buffer.length <= 3 || JOIN_TAIL.test(buffer) || JOIN_HEAD.test(line));
    if (join) {
      buffer += /[A-Za-z]$/.test(buffer) && /^[A-Za-z]/.test(line) ? ` ${line}` : line;
    } else {
      paragraphs.push(buffer);
      buffer = line;
    }
  }
  if (buffer) paragraphs.push(buffer);
  return paragraphs;
}

function parse(file: string, category: string): Doc | { skip: string } {
  const raw = fs.readFileSync(file, "utf8").replace(ZERO_WIDTH, "");
  // 标题只取 "# " 同一行（原始标题为空时不能把下一行的"**来源**"当成标题）
  const scrapedTitle = raw.match(/^#[ \t]+(.+)$/m)?.[1]?.trim() ?? "";
  const url = raw.match(/\*\*(?:来源|原文链接)\*\*:\s*(\S+)/)?.[1];
  let date = raw.match(/\*\*发布日期\*\*:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const separator = raw.search(/^---\s*$/m);
  const body = separator >= 0 ? raw.slice(separator).replace(/^---\s*/, "") : "";
  const isLibrary = Boolean(url?.includes("lib.dgcu.edu.cn"));

  let lines = body
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, " ").replace(/\s{2,}/g, " ").trim())
    .map((line) => (isLibrary ? line.replace(ICON_SNAKE, "").trim() : line))
    // 旧版新闻图集的分页标记
    .map((line) => line.replace(/\[Page\]/g, "").trim())
    .filter((line) => line && !(isLibrary && ICON_ONLY_LINE.test(line)));

  // 页尾之后（相关新闻列表等）不参与判断
  const footerAt = lines.findIndex((line) => FOOTER_LINE.test(line) || FOOTER_ANYWHERE.test(line));
  const main = footerAt > 0 ? lines.slice(0, footerAt) : lines;

  // 文章列表页（一串"标题 + 日期 + 详情"）没有正文价值
  const listy = main.filter(
    (line) =>
      DATE_LINE.test(line) ||
      /^\d{1,2}$/.test(line) ||
      /^(详情|查看详情|阅读全文|更多|more)$/i.test(line) ||
      /^(发布日期|发布时间|栏目|浏览)[：:]/.test(line),
  ).length;
  if (main.length >= 8 && ((url && LIST_URL.test(url) && listy / main.length > 0.15) || listy / main.length > 0.3)) {
    return { skip: "列表页" };
  }

  // 页头：只在第一段长文字之前找导航、作者、日期等信息（元信息行再长也不算正文）。
  // 也不能越过页尾：正文是图片的页面没有长文字，否则会把"相关新闻"里的日期当成页头，正文变成别的文章标题
  const titleKey = normalizeTitle(scrapedTitle.replace(SITE_SUFFIX, ""));
  const firstLong = lines.findIndex(
    (line) =>
      line.length >= 40 && !MARKER_INLINE.test(line) && !MARKER_WITH_VALUE.test(line) && normalizeTitle(line) !== titleKey,
  );
  const limit = Math.min(firstLong === -1 ? lines.length : firstLong, footerAt === -1 ? lines.length : footerAt, 60);
  let start = 0;
  let headerTitle = "";
  // 文章标题在作者、发布时间这些元信息的上方；中间可能夹着"来源：人事处"这类字段，往上跳过
  const titleAbove = (i: number) => {
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const candidate = lines[j];
      const isMeta =
        MARKER_INLINE.test(candidate) ||
        MARKER_WITH_VALUE.test(candidate) ||
        /^[^：:\s]{1,6}[：:]/.test(candidate) ||
        NAV_LINE.test(candidate) ||
        DATE_LINE.test(candidate);
      if (!isMeta) return candidate;
    }
    return "";
  };
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (MARKER_WITH_VALUE.test(line)) {
      const next = lines[i + 1] ?? "";
      const nextIsValue = next.length < 30 && !TERMINAL.test(next);
      if (!date && /^(更新时间|发布时间|发布日期)/.test(line)) date = next.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      start = Math.max(start, i + (nextIsValue ? 2 : 1));
      if (!headerTitle && i > 0 && /^(作者|发布时间|发布日期)/.test(line)) headerTitle = titleAbove(i);
    } else if (MARKER_INLINE.test(line)) {
      if (!date) date = line.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      if (!headerTitle && i > 0 && /^(作者|发布时间|发布日期|栏目|来源)/.test(line)) headerTitle = titleAbove(i);
      start = Math.max(start, i + 1);
    } else if (DATE_LINE.test(line) || NAV_LINE.test(line) || normalizeTitle(line) === titleKey) {
      if (!date) date = line.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      start = Math.max(start, i + 1);
    }
  }

  // 页尾：上一篇、相关新闻、版权所有、"一审二审三审"等
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (FOOTER_LINE.test(lines[i]) || FOOTER_ANYWHERE.test(lines[i])) {
      end = i;
      break;
    }
  }
  lines = lines.slice(start, end);
  // 页头日期挂件剩下的数字（如"28"）；但"9 / 月2日上午"这种被拆开的正文开头要保留
  while (lines.length && /^\d+$/.test(lines[0]) && !/^[年月日号时点]/.test(lines[1] ?? "")) lines.shift();

  // 去掉开头重复的标题行
  while (lines.length && normalizeTitle(lines[0]) === titleKey) lines.shift();

  // 标题：子站常把网站名或栏目名当标题，这时改用正文开头的文章标题
  let title = scrapedTitle.replace(SITE_SUFFIX, "").trim();
  if ((!title || GENERIC_TITLE.test(title)) && headerTitle && !NAV_LINE.test(headerTitle)) {
    title = headerTitle.replace(SITE_SUFFIX, "").trim();
  }
  if (!title || GENERIC_TITLE.test(title)) {
    // 子站首页、栏目页：正文有实质内容才保留，用"栏目·页面名"作标题（如"图书馆·电子资源"）
    if (joinLines(lines).join("").length < 150) return { skip: "没有可用标题" };
    const section = title && !/东莞城市学院|委员会/.test(title) ? title : "首页";
    title = section === category ? category : `${category}·${section}`;
  }
  title = title.replace(/^【[^】]{2,6}】/, "").trim() || title;

  const paragraphs = joinLines(lines).filter((p) => normalizeTitle(p) !== normalizeTitle(title));
  if (!date) {
    for (const paragraph of paragraphs.slice(-3).reverse()) {
      const signed = paragraph.match(/(20\d{2}|19\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*$/);
      if (signed) {
        date = `${signed[1]}-${signed[2].padStart(2, "0")}-${signed[3].padStart(2, "0")}`;
        break;
      }
    }
  }
  const textLength = paragraphs.join("").length;
  // 调试：KB_DEBUG=文件名片段 时打印清洗过程
  if (process.env.KB_DEBUG && file.includes(process.env.KB_DEBUG)) {
    console.log({ file: path.basename(file), title, headerTitle, date, start, end, kept: lines.slice(0, 8), paragraphs: paragraphs.slice(0, 5) });
  }
  // 正文是图片或附件时：资料、通知类保留标题和原文链接（如校历、章程），新闻类跳过
  const kind = kindOf(category, title);
  if (textLength < 30 && (kind === "新闻" || !url)) return { skip: "正文为空或过短" };

  return {
    category,
    kind,
    title,
    url,
    date,
    paragraphs: textLength ? paragraphs : [ATTACHMENT_ONLY_NOTE],
  };
}

function safeFileName(name: string) {
  return name
    .replace(/[\\/:*?"<>|\r\n]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".md") ? [full] : [];
  });
}

const seenUrls = new Set<string>();
const seenBodies = new Set<string>();
const usedNames = new Set<string>();
const fetchedDate = new Date().toISOString().slice(0, 10);
let written = 0;
let totalChars = 0;

fs.rmSync(outputDir, { recursive: true, force: true });

// 先处理资料类栏目，重复内容优先保留在资料类里
const files = walk(sourceDir)
  .filter((file) => path.basename(file).toLowerCase() !== "readme.md")
  .sort((a, b) => {
    const rank = (file: string) => KIND_BY_CATEGORY[path.basename(path.dirname(file)).replace(/^\d+-/, "")] === "新闻";
    return Number(rank(a)) - Number(rank(b)) || a.localeCompare(b);
  });

for (const file of files) {
  const folder = path.basename(path.dirname(file));
  const category = folder.replace(/^\d+-/, "");
  const result = parse(file, category);
  if ("skip" in result) {
    bump(category, `跳过：${result.skip}`);
    // 调试：KB_DEBUG_SKIP=栏目名 时列出被跳过的文件
    if (process.env.KB_DEBUG_SKIP === category) console.log(`  [跳过·${result.skip}] ${path.basename(file)}`);
    continue;
  }

  const urlKey = result.url?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const bodyKey = createHash("sha1").update(result.paragraphs.join("").replace(/\s+/g, "")).digest("hex");
  if ((urlKey && seenUrls.has(urlKey)) || (result.paragraphs.join("").length > 60 && seenBodies.has(bodyKey))) {
    bump(category, "跳过：重复");
    continue;
  }
  if (urlKey) seenUrls.add(urlKey);
  seenBodies.add(bodyKey);

  const base = safeFileName(`${result.date ? `${result.date}_` : ""}${result.title}`);
  let name = base;
  for (let i = 2; usedNames.has(`${folder}/${name}`); i++) name = `${base}-${i}`;
  usedNames.add(`${folder}/${name}`);

  const frontmatter = [
    "---",
    `title: ${result.title}`,
    `category: ${result.category}`,
    `kind: ${result.kind}`,
    result.url ? `source: ${result.url}` : null,
    result.date ? `updated: ${result.date}` : null,
    `fetched: ${fetchedDate}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");
  const content = `${frontmatter}\n\n# ${result.title}\n\n${result.paragraphs.join("\n\n")}\n`;
  fs.mkdirSync(path.join(outputDir, folder), { recursive: true });
  fs.writeFileSync(path.join(outputDir, folder, `${name}.md`), content);
  bump(category, "导入");
  written += 1;
  totalChars += result.paragraphs.join("").length;
}

console.log(`导入完成：${written} 篇，正文共 ${(totalChars / 10000).toFixed(1)} 万字 → ${outputDir}`);
for (const [category, counts] of stats) {
  console.log(
    `  ${category.padEnd(8, "　")} ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join("，")}`,
  );
}
