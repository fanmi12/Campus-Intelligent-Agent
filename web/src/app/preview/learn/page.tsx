import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LearnPreview } from "./learn-preview";

export const metadata: Metadata = { title: "小狮课堂组件预览", robots: { index: false, follow: false } };

// 仅开发环境可见：把各类页面和各种状态摆在一起，方便调样式。部署时 src/app/preview 会被删除，
// 所以正式组件不能从这个目录里引用任何东西
export default function LearnPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LearnPreview />;
}
