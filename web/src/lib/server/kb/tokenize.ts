// 中文检索不用分词词典：把汉字切成相邻两字（二元组），英文数字按单词，足够应付校园问答
const STOP_GRAMS = new Set([
  "什么", "怎么", "怎样", "如何", "哪里", "哪个", "哪些", "哪儿", "多少", "几点", "可以", "能不",
  "是否", "是不", "不是", "请问", "一下", "有没", "没有", "我们", "你们", "我的", "你的", "他们",
  "这个", "那个", "这些", "那些", "还有", "就是", "的话", "时候", "需要", "知道", "告诉", "帮我",
  "想要", "想问", "问一", "问下", "么时", "详细", "具体", "大概", "一般", "现在",
  "吗", "呢", "的", "了", "是", "在", "我", "你",
]);

// 含这些虚词的二元组基本没有检索价值（如"址是""的详"），直接丢掉
const FUNCTION_CHARS = new Set("的了吗呢么吧啊呀嘛哦是怎哪");

function isUseful(gram: string): boolean {
  if (STOP_GRAMS.has(gram)) return false;
  for (const char of gram) if (FUNCTION_CHARS.has(char)) return false;
  return true;
}

export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 汉字连续段切二元组；英文数字按纯字母数字切分，和 SQLite 全文索引的分词方式保持一致
  const pattern = /([㐀-鿿豈-﫿]+)|([a-z0-9]+)/g;
  for (const match of normalize(text).matchAll(pattern)) {
    if (match[1]) {
      const run = match[1];
      if (run.length === 1) {
        if (isUseful(run)) tokens.push(run);
        continue;
      }
      for (let i = 0; i < run.length - 1; i++) {
        const gram = run.slice(i, i + 2);
        if (isUseful(gram)) tokens.push(gram);
      }
    } else if (match[2]) {
      tokens.push(match[2]);
    }
  }
  return tokens;
}

export function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}
