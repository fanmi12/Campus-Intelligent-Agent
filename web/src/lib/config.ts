// 品牌与首页文案。改名字、换吉祥物、换推荐问题都在这里改。
export const site = {
  name: "城院小狮",
  school: "东莞城市学院",
  tagline: "你的校园智能助手",
  avatarSrc: "/brand/chengyuan-xiaoshi-chibi-v3.webp",
  description:
    "东莞城市学院校园智能助手：回答校园问题并注明出处，拍下通知就能一键加入手机日历。",
  disclaimer: "回答依据学校公开资料整理，重要事项请以学校官方通知为准",
  // 体验问卷（问卷星），用于用户体验评测。题数和时长只用于入口文案，改问卷后记得同步
  survey: {
    url: "https://v.wjx.cn/vm/YHVne3y.aspx",
    provider: "问卷星",
    questions: 10,
    minutes: 2,
  },
  // 小狮课堂（AI 互动微课）：入口、首页文案和示例主题
  learn: {
    name: "小狮课堂",
    tagline: "一句话，备一节互动微课",
    description: "输入想学的内容，狮老师帮你备一节 5-15 分钟的互动微课：讲解、测验、闪卡、讨论，学完还能生成复习计划。",
    examples: ["线性代数：矩阵乘法怎么算", "高数：导数的直观理解", "概率论：贝叶斯公式", "Python 入门：for 循环", "数据结构：栈和队列", "四级听力的答题技巧"],
    credit: "课堂形式参考了清华大学开源项目 OpenMAIC 的设计",
  },
  suggestions: [
    {
      icon: "map",
      title: "学校在哪",
      prompt: "学校的详细地址是什么？从东莞站怎么过去？",
    },
    {
      icon: "calendar",
      title: "通知加日历",
      prompt:
        "帮我把这条通知加到日历：下周三下午2点在图书馆报告厅开新生安全讲座，记得带学生证。",
    },
    {
      icon: "food",
      title: "今天吃什么",
      prompt: "预算20元，推荐几个校园餐食，想看看图片。",
    },
    {
      icon: "checklist",
      title: "办事清单",
      prompt: "复学申请有哪些步骤？帮我整理成可以勾选的办事清单。",
    },
    { icon: "study", title: "AI 小课堂", prompt: "给我上一节 5 分钟的小课：线性代数里的矩阵乘法。" },
    { icon: "contact", title: "招生联系卡", prompt: "学校招生咨询电话是多少？帮我整理成联系卡。" },
  ],
} as const;

export type SuggestionIcon = (typeof site.suggestions)[number]["icon"];
