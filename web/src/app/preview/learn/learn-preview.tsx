"use client";

import { ScenePlaceholder, SceneView } from "@/components/learn/classroom";
import { GeneratingState } from "@/components/learn/generating-state";
import { DiscussionScene } from "@/components/learn/scenes/discussion-scene";
import { SourceProvider } from "@/components/learn/source-badges";
import { demoLesson, previewLesson } from "@/lib/learn/fixtures";
import type { Lesson, LessonScene } from "@/lib/learn/schema";

// 小狮课堂组件预览：每种页面、备课中的各个阶段、失败和编写中的页面
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="flex min-h-[420px] flex-col rounded-3xl border bg-background p-4">{children}</div>
    </section>
  );
}

const noop = () => {};

// 讨论页的示例（演示课程里没有讨论页）
const discussion: Extract<LessonScene, { kind: "discussion" }> = {
  id: "s9",
  kind: "discussion",
  title: "说说你的做法",
  goal: "交流各自安排复习的办法",
  keyPoints: ["复习安排"],
  status: "ready",
  content: {
    question: "你们考试周一般怎么安排一天的复习时间？",
    context: "考试周快到了，大家的习惯各不相同。",
    opening: [
      { agent: "xiaolin", text: "我习惯把一天分成三个时间块，中间留十分钟走动一下。" },
      { agent: "xiaomei", text: "我喜欢晚上复习，可第二天早上总想不起来，是不是方法不对？" },
      { agent: "teacher", text: "小美这个疑问很常见。你们呢，说说自己的做法吧。" },
    ],
  },
};
const stage = (step: Lesson["step"], scenes: Lesson["scenes"] = []): Lesson => ({ ...previewLesson, step, scenes, status: "generating" });

export function LearnPreview() {
  return (
    <SourceProvider sources={previewLesson.sources}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-8">
        <header>
          <h1 className="text-xl font-semibold">小狮课堂组件预览</h1>
          <p className="mt-1 text-sm text-muted-foreground">仅开发环境可见。前两页的要点带出处角标（示例资料），可以点开看看。</p>
        </header>

        {previewLesson.scenes.map((scene, index) =>
          scene.status === "ready" && scene.content ? (
            <Section key={scene.id} title={`第 ${index + 1} 页 · ${scene.kind}`}>
              <SceneView scene={scene} lesson={previewLesson} hasNext onNext={noop} />
            </Section>
          ) : (
            <Section key={scene.id} title={`第 ${index + 1} 页 · ${scene.kind} · ${scene.status}`}>
              <ScenePlaceholder scene={scene} index={index} total={previewLesson.scenes.length} owner retrying={false} onRetry={noop} />
            </Section>
          ),
        )}

        <Section title="第 7 页 · discussion（发言需要课程存在于服务器，预览课程会提示出错）">
          <DiscussionScene scene={discussion} lesson={previewLesson} />
        </Section>

        <Section title="备课中：排队">
          <GeneratingState lesson={stage("queued")} queuePosition={2} />
        </Section>
        <Section title="备课中：查资料（用户资料）">
          <GeneratingState lesson={{ ...stage("researching"), grounding: "material" }} />
        </Section>
        <Section title="备课中：设计大纲">
          <GeneratingState lesson={stage("outlining")} />
        </Section>
        <Section title="备课中：编写页面">
          <GeneratingState lesson={stage("writing", demoLesson.scenes.map((scene, index) => (index < 2 ? scene : { ...scene, status: "pending" as const, content: undefined })) as Lesson["scenes"])} />
        </Section>
      </div>
    </SourceProvider>
  );
}
