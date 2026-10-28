// 品牌与首页文案。改名字、换吉祥物、换推荐问题都在这里改。
export const site = {
  name: "城院小狮",
  school: "东莞城市学院",
  tagline: "你的校园智能助手",
  avatarSrc: "/brand/chengyuan-xiaoshi-chibi-v3.webp",
  description:
    "东莞城市学院校园智能助手：回答校园问题并注明出处，拍下通知就能一键加入手机日历。",
  disclaimer: "回答依据学校公开资料整理，重要事项请以学校官方通知为准",
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
    { icon: "study", title: "英语复习卡", prompt: "帮我复习几个校园通知中常见的英语单词，做成翻面卡和小测验。" },
    { icon: "contact", title: "招生联系卡", prompt: "学校招生咨询电话是多少？帮我整理成联系卡。" },
  ],
} as const;

export type SuggestionIcon = (typeof site.suggestions)[number]["icon"];
