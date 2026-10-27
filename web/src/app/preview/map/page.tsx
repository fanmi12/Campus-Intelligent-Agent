import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReplyPreview } from "./reply-preview";

export const metadata: Metadata = { title: "互动回复本地预览", robots: { index: false, follow: false } };

export default function MapPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ReplyPreview />;
}
