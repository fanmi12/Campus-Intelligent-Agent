import type { StudyData } from "./ai/result-schemas";

export const starterStudy: StudyData = {
  title: "校园常用英语",
  words: [
    { word: "deadline", pronunciation: "/ˈdedlaɪn/", meaning: "截止时间", example: "The deadline is next Friday.", translation: "截止时间是下周五。", question: "报名通知中的 deadline 指什么？", options: ["报名地点", "截止时间", "活动负责人"], answer: 1 },
    { word: "application", pronunciation: "/ˌæplɪˈkeɪʃən/", meaning: "申请；申请表", example: "Please complete the application form.", translation: "请填写申请表。", question: "application form 的意思是？", options: ["申请表", "学生证", "成绩单"], answer: 0 },
    { word: "enrollment", pronunciation: "/ɪnˈrəʊlmənt/", meaning: "注册；入学登记", example: "Complete your enrollment online.", translation: "在线完成注册。", question: "enrollment 表示什么？", options: ["毕业典礼", "学费凭证", "注册登记"], answer: 2 },
  ],
};
