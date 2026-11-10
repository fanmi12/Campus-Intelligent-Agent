"use client";

import { ChevronDown, ImagePlus, LoaderCircle, NotebookPen, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { getClientId } from "@/components/chat/storage";
import { useAppStatus } from "@/components/chat/use-app-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { site } from "@/lib/config";
import { compressImage } from "@/lib/image";
import { LEVELS, MINUTES, type Level, type Minutes, type RequestedGrounding } from "@/lib/learn/schema";
import { upsertLocalLesson } from "./learn-storage";
import styles from "./learn.module.css";

const MAX_TOPIC = 200;
const MAX_MATERIAL = 12000;
const MAX_IMAGES = 3;
// 单张图片的 data URL 上限（接口限 2,000,000 字符），超出时压得更小再试
const MAX_IMAGE_CHARS = 1_900_000;
const MATERIAL_TOPIC = "把这份资料做成一节课";

type Photo = { url: string; mediaType: string; name: string };

const GROUNDING_OPTIONS: { value: RequestedGrounding; label: string; hint: string }[] = [
  { value: "auto", label: "自动", hint: "和学校有关就查校园资料，否则按通用知识讲" },
  { value: "campus", label: "校园资料", hint: "只用校园资料里查到的内容讲，查不到再改按通用知识" },
  { value: "general", label: "通用知识", hint: "不查校园资料，按通用知识讲" },
];

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className={`${styles.seg} flex-1`} role="group" aria-label={label}>
        {options.map((option) => (
          <button key={String(option.value)} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 课堂首页的表单：写下想学的主题，选时长、难度和依据，点「开始备课」；
// 也可以粘贴笔记文字、拍下课本或课件，这时课程以你提供的资料为准
export function LessonForm() {
  const router = useRouter();
  const topicId = useId();
  const status = useAppStatus();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState<Minutes>(10);
  const [level, setLevel] = useState<Level>("入门");
  const [grounding, setGrounding] = useState<RequestedGrounding>("auto");
  const [materialOpen, setMaterialOpen] = useState(false);
  const [material, setMaterial] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const trimmed = topic.trim();
  const hasMaterial = material.trim().length > 0 || photos.length > 0;
  const canSubmit = (trimmed.length >= 2 || hasMaterial) && !submitting && !processing;
  const visionEnabled = status?.vision ?? false;

  async function addPhotos(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/")).slice(0, MAX_IMAGES - photos.length);
    if (!images.length) {
      if (files.length) toast.info(`最多添加 ${MAX_IMAGES} 张图片`);
      return;
    }
    setProcessing(true);
    try {
      const added: Photo[] = [];
      for (const file of images) {
        let image = await compressImage(file);
        if (image.url.length > MAX_IMAGE_CHARS) image = await compressImage(file, 1200, 0.7);
        if (image.url.length > MAX_IMAGE_CHARS) throw new Error("这张图片太大了，换一张或者拍近一点");
        added.push({ url: image.url, mediaType: image.mediaType, name: image.filename });
      }
      setPhotos((current) => [...current, ...added].slice(0, MAX_IMAGES));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "图片处理失败");
    } finally {
      setProcessing(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const title = trimmed.length >= 2 ? trimmed : MATERIAL_TOPIC;
    try {
      const response = await fetch("/api/learn/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Id": getClientId() },
        body: JSON.stringify({
          topic: title,
          minutes,
          level,
          grounding,
          // 超过上限的部分不要（接口会拒绝过长的资料）
          material: material.trim() ? material.trim().slice(0, MAX_MATERIAL) : undefined,
          images: photos.length ? photos.map(({ url, mediaType }) => ({ url, mediaType })) : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; status?: "generating" | "ready" | "failed"; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "创建失败，请稍后再试");
        setSubmitting(false);
        return;
      }
      upsertLocalLesson({ id: data.id, title: title.slice(0, 30), topic: title, createdAt: Date.now(), status: data.status ?? "generating" });
      router.push(`/learn/${data.id}`);
    } catch {
      setError("网络好像断了，检查一下网络再试");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Textarea
          id={topicId}
          ref={textarea}
          value={topic}
          onChange={(event) => setTopic(event.target.value.slice(0, MAX_TOPIC))}
          rows={3}
          maxLength={MAX_TOPIC}
          placeholder="想学什么？例如：线性代数里的矩阵乘法怎么算"
          aria-label="想学的主题"
          className="min-h-24 rounded-2xl bg-card text-[15px]"
        />
        <p className="text-right text-xs text-muted-foreground">
          {topic.length}/{MAX_TOPIC}
        </p>
      </div>

      <div className={styles.chips} role="group" aria-label="示例主题">
        {site.learn.examples.map((example) => (
          <button
            key={example}
            type="button"
            className={styles.chip}
            onClick={() => {
              setTopic(example);
              textarea.current?.focus();
            }}
          >
            {example}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        <Segmented label="时长" value={minutes} onChange={setMinutes} options={MINUTES.map((value) => ({ value, label: `${value} 分钟` }))} />
        <Segmented label="难度" value={level} onChange={setLevel} options={LEVELS.map((value) => ({ value, label: value }))} />
        {hasMaterial ? (
          <p className="pl-12 text-xs leading-5 text-muted-foreground">依据：你提供的资料。这节课会以资料为准，必要时补充理解所需的背景知识。</p>
        ) : (
          <>
            <Segmented label="依据" value={grounding} onChange={setGrounding} options={GROUNDING_OPTIONS} />
            <p className="pl-12 text-xs leading-5 text-muted-foreground">{GROUNDING_OPTIONS.find((option) => option.value === grounding)?.hint}</p>
          </>
        )}
      </div>

      <div className="rounded-2xl border bg-card/60">
        <button
          type="button"
          className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-medium"
          aria-expanded={materialOpen}
          aria-controls={`${topicId}-material`}
          onClick={() => setMaterialOpen((open) => !open)}
        >
          <NotebookPen className="size-4 text-primary" />
          <span className="flex-1">{hasMaterial ? "已添加学习资料" : "添加学习资料（粘贴 / 拍照）"}</span>
          <ChevronDown className={`size-4 text-muted-foreground transition ${materialOpen ? "rotate-180" : ""}`} />
        </button>
        <div id={`${topicId}-material`} hidden={!materialOpen} className="flex flex-col gap-3 px-4 pb-4">
          <Textarea
            value={material}
            onChange={(event) => setMaterial(event.target.value)}
            rows={5}
            placeholder="把课堂笔记、课件文字或老师发的资料粘贴在这里…"
            aria-label="学习资料文字"
            className="min-h-28 rounded-xl bg-background text-[15px]"
          />
          <p className={`text-xs ${material.length > MAX_MATERIAL ? "text-warning" : "text-muted-foreground"}`}>
            {material.length}/{MAX_MATERIAL}
            {material.length > MAX_MATERIAL ? " · 超出的部分不会被使用" : ""}
          </p>
          {visionEnabled && (
            <div className="flex flex-wrap items-center gap-2">
              {photos.map((photo, index) => (
                <div key={index} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 本地压缩后的 data URL，不需要 next/image 优化 */}
                  <img src={photo.url} alt={`资料照片 ${index + 1}`} className="size-16 rounded-xl border object-cover" />
                  <button
                    type="button"
                    aria-label={`移除资料照片 ${index + 1}`}
                    onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                    className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_IMAGES && (
                <Button type="button" variant="outline" disabled={processing} onClick={() => fileInput.current?.click()}>
                  {processing ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
                  拍照 / 选图
                </Button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files) void addPhotos(Array.from(event.target.files));
                  event.target.value = "";
                }}
              />
            </div>
          )}
          <p className="text-xs leading-5 text-muted-foreground">资料原文只用来生成这节课，最长在服务器保存 7 天；拿到课程链接的人只能看到生成的课程，看不到你的资料原文。图片不会保存。</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={!canSubmit}>
        {submitting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
        {submitting ? "正在提交…" : "开始备课"}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">约需 1 分钟。拿到链接的人都能看到这节课，请不要填写个人隐私。</p>
    </form>
  );
}
