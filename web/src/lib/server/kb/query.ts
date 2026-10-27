import { normalize, tokenize } from "./tokenize";

// 把用户的问题变成检索计划：去掉问句虚词、补充同义词，并记下每个检索词覆盖了问题里的哪几个字

// 问法本身不是检索内容："有多少个""怎么办理""在哪里"等先去掉，避免切出"少个""有什"这类无意义的词
const QUESTION_WORDS =
  /请问|你好|您好|我想知道|想知道|想问一下|想问|问一下|帮我查一下|帮我查|查一下|告诉我|麻烦|一下|是什么|是多少|有多少个|多少个|有多少|多少|有哪些|哪些|有什么|什么样|什么时候|什么|是谁|谁是|在哪里|在哪儿|在哪|哪里|哪儿|怎么办理|怎么办|怎么样|怎样|怎么|如何|能不能|可不可以|可以吗|可以|是否|几点|几号|几月|要求|需要|吗|呢|吧|啊|呀|的|了|我/g;

// 校园常用说法的同义词：同学说"开门"，通知里写"开放时间"；同学说"饭堂"，资料里写"食堂"
const SYNONYM_GROUPS: string[][] = [
  ["开门", "开放", "开馆", "营业"],
  ["关门", "闭馆", "关闭"],
  ["几点", "什么时候", "时间", "时段"],
  ["食堂", "饭堂", "餐厅"],
  ["宿舍", "寝室", "学生公寓"],
  ["补办", "补领", "挂失"],
  ["学生证", "学生卡"],
  ["校园卡", "一卡通", "饭卡"],
  ["招聘会", "双选会", "宣讲会"],
  ["二级学院", "学院", "院系"],
  ["校长", "校领导", "现任领导"],
  ["奖学金", "助学金", "资助", "奖助学金"],
  ["转专业", "专业调整"],
  ["补考", "重修", "缓考"],
  ["校医室", "医务室", "卫生所", "校医院"],
  ["快递", "驿站", "快递点"],
  ["校园网", "无线网", "wifi", "上网"],
  ["四六级", "英语四级", "英语六级", "cet"],
  ["论文", "毕业论文", "毕业设计"],
  ["地址", "位置", "交通", "怎么去"],
  ["心理咨询", "心理健康", "心理中心"],
  ["报到", "入学", "新生报到"],
  ["学费", "收费标准", "缴费"],
  ["水电费", "电费", "水费"],
  ["知网", "cnki"],
  ["数据库", "电子资源"],
  ["vpn", "校外访问", "外网访问", "远程访问", "校外"],
  ["自习", "自习室", "空教室", "阅览室"],
  ["选课", "课表", "课程表"],
];

type Unit = { term: string; positions: number[] };

export type QueryPlan = {
  terms: string[];
  expansions: string[];
  units: Unit[];
  length: number;
  synonymHits: { positions: number[]; alternatives: string[][] }[];
};

const CJK_RUN = /[㐀-鿿豈-﫿]+|[a-z0-9]+/g;

function termsOf(word: string): string[] {
  return tokenize(word);
}

export function planQuery(question: string): QueryPlan {
  const original = normalize(question);
  const text = original.replace(QUESTION_WORDS, " ");

  // 每个检索词覆盖问题中的哪些字（用于算"问题被资料覆盖了多少"）
  const units: Unit[] = [];
  for (const match of text.matchAll(CJK_RUN)) {
    const run = match[0];
    const offset = match.index ?? 0;
    if (/^[a-z0-9]+$/.test(run)) {
      units.push({ term: run, positions: [offset] });
      continue;
    }
    // 单个汉字（如"看""去"）几乎都是动词或虚词，资料里也很少单独出现，不作为检索词
    if (run.length === 1) continue;
    for (let i = 0; i < run.length - 1; i++) {
      const [term] = tokenize(run.slice(i, i + 2));
      if (term) units.push({ term, positions: [offset + i, offset + i + 1] });
    }
  }
  const terms = [...new Set(units.map((unit) => unit.term))];

  // 同义词：问题里出现了某组的词，就把同组其他词也加进检索
  const expansions = new Set<string>();
  const synonymHits: QueryPlan["synonymHits"] = [];
  for (const group of SYNONYM_GROUPS) {
    const present = group.filter((word) => original.includes(word));
    if (!present.length) continue;
    const alternatives = group.filter((word) => !present.includes(word)).map(termsOf);
    for (const alternative of alternatives) for (const term of alternative) if (!terms.includes(term)) expansions.add(term);
    for (const word of present) {
      const at = text.indexOf(word);
      if (at >= 0) synonymHits.push({ positions: Array.from({ length: word.length }, (_, i) => at + i), alternatives });
    }
  }

  return { terms, expansions: [...expansions], units, length: text.length, synonymHits };
}

// 资料覆盖了问题的多少：按字计算，每个字的权重取覆盖它的检索词里最少见的那个（IDF 最大）
export function coverageOf(plan: QueryPlan, chunkTerms: Set<string>, idf: Map<string, number>): number {
  const weights = new Map<number, number>();
  for (const unit of plan.units) {
    const weight = idf.get(unit.term) ?? 0;
    for (const position of unit.positions) weights.set(position, Math.max(weights.get(position) ?? 0, weight));
  }
  const covered = new Set<number>();
  for (const unit of plan.units) if (chunkTerms.has(unit.term)) for (const position of unit.positions) covered.add(position);
  // 资料里用的是同义词，也算覆盖（如问"开门"、资料写"开放"）
  for (const hit of plan.synonymHits) {
    if (hit.alternatives.some((terms) => terms.length > 0 && terms.every((term) => chunkTerms.has(term)))) {
      for (const position of hit.positions) covered.add(position);
    }
  }
  let total = 0;
  let matched = 0;
  for (const [position, weight] of weights) {
    total += weight;
    if (covered.has(position)) matched += weight;
  }
  return total ? matched / total : 0;
}

// 判断"有资料"的门槛：问题去掉虚词后越短（如"食堂开门"只有 4 个字），每个词越关键，门槛越高
export function confidenceThreshold(plan: QueryPlan, idf: Map<string, number>): number {
  const positions = new Set(plan.units.filter((unit) => (idf.get(unit.term) ?? 0) > 0).flatMap((unit) => unit.positions));
  if (positions.size <= 5) return 0.7;
  if (positions.size <= 8) return 0.6;
  return 0.5;
}
