"use client";

import dynamic from "next/dynamic";
import { ChatHeader } from "./header";

// 聊天记录存在浏览器本地，所以聊天界面只在浏览器端渲染；加载期间先显示同样布局的骨架，避免页面跳动
function ChatSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-aurora">
      <ChatHeader />
      <div className="flex-1" />
    </div>
  );
}

const ChatApp = dynamic(() => import("./chat-app"), { ssr: false, loading: ChatSkeleton });

export function Chat() {
  return <ChatApp />;
}
