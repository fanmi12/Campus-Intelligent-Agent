"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientId } from "@/components/chat/storage";
import { MAX_HISTORY, readEvents, type DiscussEvent } from "@/lib/learn/stream";
import type { AgentId } from "@/lib/learn/schema";

// 课堂讨论 / 问狮老师共用的对话 Hook：把学习者的发言发给服务端，逐条接收老师和 AI 同学的流式回应

export type ChatTurn = { id: string; agent: "user" | AgentId; text: string; streaming?: boolean };

let counter = 0;
const uid = () => `u${Date.now().toString(36)}${(counter++).toString(36)}`;

export function useDiscussion({
  lessonId,
  sceneId,
  mode,
  initial = [],
  onSettled,
}: {
  lessonId: string;
  sceneId: string;
  mode: "ask" | "discuss";
  initial?: ChatTurn[];
  // 一轮结束（说完、出错或被打断）时回调，讨论页用它把记录存进本地进度
  onSettled?: (turns: ChatTurn[]) => void;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>(initial);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState(0);
  const [error, setError] = useState("");
  const turnsRef = useRef(turns);
  const abort = useRef<AbortController | null>(null);
  const settled = useRef(onSettled);
  useEffect(() => {
    turnsRef.current = turns;
    settled.current = onSettled;
  });

  // 离开页面时停掉还在进行的请求
  useEffect(() => () => abort.current?.abort(), []);

  const apply = useCallback((change: (current: ChatTurn[]) => ChatTurn[]) => {
    const next = change(turnsRef.current);
    turnsRef.current = next;
    setTurns(next);
  }, []);

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || abort.current) return;
      const history = turnsRef.current.filter((turn) => !turn.streaming && turn.text).slice(-MAX_HISTORY).map(({ agent, text: body }) => ({ agent, text: body.slice(0, 600) }));
      apply((current) => [...current, { id: uid(), agent: "user", text }]);
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      setQueue(0);
      setError("");
      const handle = (event: DiscussEvent) => {
        if (event.type === "queue") setQueue(event.position);
        else if (event.type === "turn") {
          setQueue(0);
          apply((current) => [...current, { id: event.id, agent: event.agent, text: "", streaming: true }]);
        } else if (event.type === "delta") apply((current) => current.map((turn) => (turn.id === event.id ? { ...turn, text: turn.text + event.text } : turn)));
        else if (event.type === "end") apply((current) => current.map((turn) => (turn.id === event.id ? { ...turn, streaming: false } : turn)));
        else if (event.type === "error") setError(event.message);
      };
      try {
        const response = await fetch(`/api/learn/lessons/${lessonId}/discuss`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Client-Id": getClientId() },
          body: JSON.stringify({ sceneId, mode, message: text, history }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? "暂时没法回应，请稍后再试");
        } else {
          await readEvents(response, handle);
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof TypeError ? "网络好像断了，检查一下网络再试" : "暂时没法回应，请稍后再试");
      } finally {
        abort.current = null;
        setBusy(false);
        setQueue(0);
        // 被打断或出错时，没说完的发言去掉流式状态，空的发言丢掉
        apply((current) => current.filter((turn) => turn.text).map((turn) => (turn.streaming ? { ...turn, streaming: false } : turn)));
        settled.current?.(turnsRef.current);
      }
    },
    [apply, lessonId, sceneId, mode],
  );

  const stop = useCallback(() => abort.current?.abort(), []);
  const clear = useCallback(() => {
    apply(() => []);
    setError("");
  }, [apply]);

  return { turns, busy, queue, error, send, stop, clear };
}
