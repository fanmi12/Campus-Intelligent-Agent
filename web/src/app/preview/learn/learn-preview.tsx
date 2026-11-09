"use client";

import { ScenePlaceholder, SceneView } from "@/components/learn/classroom";
import { GeneratingState } from "@/components/learn/generating-state";
import { SourceProvider } from "@/components/learn/source-badges";
import { demoLesson, previewLesson } from "@/lib/learn/fixtures";
import type { Lesson } from "@/lib/learn/schema";

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
