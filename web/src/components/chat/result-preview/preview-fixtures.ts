// 仅本地开发预览使用，正式聊天必须显式传入工具返回值。
import type { CalendarEvent } from "@/lib/ai/tools";
import type { ChecklistData, ContactData, ExamData } from "@/lib/ai/result-schemas";

export const sampleChecklist: ChecklistData = {
  title: "复学办理清单", basis: "sources",
  references: [{ n: 1, title: "复学申请审批流程（附件转写）", url: "http://tr.dgcu.edu.cn/front/article/2313.html", updated: "2026-10-13" }],
  steps: [
    { title: "填写复学申请表", detail: "填写姓名、学号、原班级、休停学时间和申请复学时间。" },
    { title: "按休学原因完成分类审核", detail: "身体疾病由医务所审核；入伍由武装部审核；心理疾病由学生部心理咨询中心审核。" },
    { title: "交所在单位审核", detail: "由所在单位学生工作负责人、单位负责人审核。" },
    { title: "到学籍考务科复核", detail: "原流程列明教务部学籍考务科，行政楼 211。" },
    { title: "交教务部分管部长审批", detail: "原流程列明行政楼 219。" },
    { title: "分送表格并办理入住", detail: "审批后复印分别交相关部门；凭表到公寓服务中心办理床位。具体以官网原表为准。" },
  ],
};
export const sampleContact: ContactData = {
  name: "招生咨询", organization: "东莞城市学院", address: "广东省东莞市寮步镇文昌路 1 号", basis: "sources",
  phones: [{ label: "咨询电话", number: "0769-23382107" }, { label: "另一条咨询热线", number: "0769-23382108" }],
  references: [{ n: 1, title: "学校概况", url: "https://dgcu.edu.cn/about.html", updated: "2026-06" }],
};
export const sampleExam: ExamData = {
  event: { id: "preview-exam", title: "大学英语期中考试（示例）", start: "2026-11-10T09:00:00+08:00", end: "2026-11-10T11:00:00+08:00", allDay: false, kind: "exam", notes: "本地预览示例，不是真实考试安排。" },
  checklist: ["确认考试地点和座位", "准备学生证与考试用品", "检查是否有准考证要求"], basis: "user", references: [],
};
export const sampleEvent: CalendarEvent = {
  id: "preview-campus-event", title: "校园摄影分享会（示例）", start: "2026-11-10T14:00:00+08:00",
  end: "2026-11-10T15:00:00+08:00", allDay: false, kind: "event", location: "示例地点：图书馆报告厅", notes: "仅用于本地 UI 演示，不是真实活动通知。",
};
