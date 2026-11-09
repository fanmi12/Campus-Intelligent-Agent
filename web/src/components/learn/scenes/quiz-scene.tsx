"use client";

import { ArrowRight, Check, CircleCheck, CircleDot, CircleX, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { getClientId } from "@/components/chat/storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { answerKey, isChoiceCorrect, type AnswerRecord } from "@/lib/learn/progress";
import { letterOf } from "@/lib/learn/scene-text";
import type { Lesson, LessonScene, QuizQuestion } from "@/lib/learn/schema";
import { updateProgress, useProgress } from "../learn-storage";
import styles from "../learn.module.css";
import { RichText } from "../source-badges";
import { SceneHeader } from "./scene-header";

type QuizScene = Extract<LessonScene, { kind: "quiz" }>;

const MAX_ANSWER = 600;

// 这道题是否已经做完：选择题提交即完成；简答题要给出评分（AI 批改或自评）
function isDone(question: QuizQuestion, answer?: AnswerRecord): boolean {
  if (!answer) return false;
  return question.type === "short" ? answer.score !== undefined : true;
}

function saveAnswer(lessonId: string, key: string, record: AnswerRecord) {
  updateProgress(lessonId, (progress) => ({ ...progress, answers: { ...progress.answers, [key]: record } }));
}

type QuestionProps = {
  lessonId: string;
  sceneId: string;
  question: QuizQuestion;
  index: number;
  total: number;
  onContinue: () => void;
};

function Header({ question, index, total }: Pick<QuestionProps, "question" | "index" | "total">) {
  const kind = question.type === "single" ? "单选" : question.type === "multiple" ? "多选" : "简答";
  return (
    <p className={styles.muted}>
      第 {index + 1}/{total} 题 · {kind}
      {question.type === "multiple" ? "（选出所有正确的）" : ""}
    </p>
  );
}

function ChoiceQuestion({ lessonId, sceneId, question, index, total, onContinue }: QuestionProps) {
  const name = useId();
  const key = answerKey(sceneId, index);
  const answer = useProgress(lessonId).answers[key];
  const [draft, setDraft] = useState<number[]>([]);
  const submitted = Boolean(answer);
  const picked = submitted ? (answer?.choice ?? []) : draft;
  const multiple = question.type === "multiple";
  const correct = submitted && Boolean(answer?.correct);

  function toggle(option: number) {
    if (submitted) return;
    setDraft((current) => (multiple ? (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]) : [option]));
  }

  return (
    <div className="flex flex-col gap-4">
      <Header question={question} index={index} total={total} />
      <fieldset className={styles.options}>
        <legend>
          <RichText text={question.prompt} />
        </legend>
        {question.options.map((option, optionIndex) => {
          const isPicked = picked.includes(optionIndex);
          const state = submitted ? (question.answers.includes(optionIndex) ? "correct" : isPicked ? "wrong" : undefined) : undefined;
          return (
            <label key={optionIndex} className={styles.option} data-selected={!submitted && isPicked} data-state={state} data-locked={submitted}>
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                checked={isPicked}
                disabled={submitted}
                onChange={() => toggle(optionIndex)}
              />
              <span className={styles.letter}>{letterOf(optionIndex)}.</span>
              <span className="min-w-0 flex-1">{option}</span>
              {state === "correct" && <Check className="mt-1 size-4 shrink-0 text-success" aria-label="正确答案" />}
              {state === "wrong" && <X className="mt-1 size-4 shrink-0 text-destructive" aria-label="你的选择有误" />}
            </label>
          );
        })}
      </fieldset>
      {submitted && (
        <div role="status" className={styles.feedback} data-tone={correct ? "correct" : "wrong"}>
          <strong>{correct ? "答对了！" : `答错了，正确答案是 ${question.answers.map(letterOf).join("、")}。`}</strong>
          <br />
          <RichText text={question.explanation} />
        </div>
      )}
      {submitted ? (
        <Button size="lg" onClick={onContinue}>
          {index + 1 < total ? "下一题" : "查看结果"}
          <ArrowRight />
        </Button>
      ) : (
        <Button
          size="lg"
          disabled={!draft.length}
          onClick={() => saveAnswer(lessonId, key, { choice: [...draft].sort((a, b) => a - b), correct: isChoiceCorrect(question, draft) })}
        >
          提交答案
        </Button>
      )}
    </div>
  );
}

const TONE = (score: number) => (score >= 80 ? "correct" : score >= 40 ? "partial" : "wrong");

function ShortQuestion({ lessonId, sceneId, question, index, total, onContinue }: QuestionProps) {
  const key = answerKey(sceneId, index);
  const answer = useProgress(lessonId).answers[key];
  const [text, setText] = useState(answer?.text ?? "");
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState("");
  const submitted = Boolean(answer);
  const rated = answer?.score !== undefined;
  const byAi = answer?.graded === "ai";

  // 交给 AI 批改；批改不可用（没网、额度、限流）时保存作答，让学习者对照参考答案自评
  async function submit() {
    const body = text.trim();
    if (!body || grading) return;
    setGrading(true);
    setGradeError("");
    try {
      const response = await fetch(`/api/learn/lessons/${lessonId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Id": getClientId() },
        body: JSON.stringify({ sceneId, question: index, answer: body }),
      });
      const data = (await response.json().catch(() => ({}))) as { score?: number; feedback?: string; hits?: string[]; missing?: string[]; error?: string };
      if (response.ok && typeof data.score === "number") {
        saveAnswer(lessonId, key, { text: body, score: data.score, feedback: data.feedback, hits: data.hits, missing: data.missing, graded: "ai" });
      } else {
        saveAnswer(lessonId, key, { text: body });
        setGradeError(data.error ?? "AI 批改暂时不可用，请对照参考答案自评");
      }
    } catch {
      saveAnswer(lessonId, key, { text: body });
      setGradeError("网络好像断了，请对照参考答案自评");
    } finally {
      setGrading(false);
    }
  }

  function rate(score: number) {
    saveAnswer(lessonId, key, { ...answer, score, graded: "self" });
  }

  return (
    <div className="flex flex-col gap-4">
      <Header question={question} index={index} total={total} />
      <h3 className="text-[16.5px] leading-[1.75] font-semibold">
        <RichText text={question.prompt} />
      </h3>
      <Textarea
        value={submitted ? (answer?.text ?? "") : text}
        onChange={(event) => setText(event.target.value.slice(0, MAX_ANSWER))}
        disabled={submitted || grading}
        rows={4}
        placeholder="用自己的话写下答案…"
        aria-label="你的答案"
        className="text-[15px]"
      />
      {!submitted && (
        <>
          <p className={styles.muted}>
            {text.length}/{MAX_ANSWER}
          </p>
          <div className="flex flex-col gap-2">
            <Button size="lg" disabled={!text.trim() || grading} onClick={() => void submit()}>
              {grading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {grading ? "狮老师批改中…" : "提交，请狮老师批改"}
            </Button>
            <Button variant="ghost" disabled={grading} onClick={() => saveAnswer(lessonId, key, { text: "", score: 0, graded: "self" })}>
              不会，直接看参考答案
            </Button>
          </div>
        </>
      )}
      {byAi && rated && (
        <div role="status" className={styles.feedback} data-tone={TONE(answer?.score ?? 0)}>
          <p className="flex items-baseline gap-2">
            <strong>狮老师批改</strong>
            <span className="text-2xl font-semibold tabular-nums">{answer?.score}</span>
            <span className={styles.muted}>/ 100</span>
          </p>
          <div className={`${styles.scoreBar} my-2`} aria-hidden>
            <span style={{ width: `${answer?.score ?? 0}%` }} />
          </div>
          <p>{answer?.feedback}</p>
          {(answer?.hits?.length ?? 0) > 0 && (
            <>
              <strong className="mt-2 block">答到了</strong>
              <ul className={styles.rubric}>
                {answer?.hits?.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {(answer?.missing?.length ?? 0) > 0 && (
            <>
              <strong className="mt-2 block">还可以补充</strong>
              <ul className={styles.rubric}>
                {answer?.missing?.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {submitted && (
        <div role="status" className={styles.feedback} data-tone={!byAi && rated ? TONE(answer?.score ?? 0) : undefined}>
          <strong>参考答案</strong>
          <br />
          <RichText text={question.reference} />
          {!byAi && question.rubric.length > 0 && (
            <>
              <br />
              <strong>得分点</strong>
              <ul className={styles.rubric}>
                {question.rubric.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </>
          )}
          <br />
          <RichText text={question.explanation} />
        </div>
      )}
      {submitted && !rated && (
        <div className="flex flex-col gap-2">
          {gradeError && (
            <p role="alert" className="text-sm text-muted-foreground">
              {gradeError}
            </p>
          )}
          <p className="text-sm font-medium">对照参考答案，你觉得自己答得怎么样？</p>
          <div className={styles.marks}>
            <button type="button" className={styles.mark} data-mark="forgot" aria-pressed={false} onClick={() => rate(0)}>
              没答对
            </button>
            <button type="button" className={styles.mark} data-mark="fuzzy" aria-pressed={false} onClick={() => rate(50)}>
              部分对
            </button>
            <button type="button" className={styles.mark} data-mark="know" aria-pressed={false} onClick={() => rate(100)}>
              答对了
            </button>
          </div>
        </div>
      )}
      {rated && (
        <Button size="lg" onClick={onContinue}>
          {index + 1 < total ? "下一题" : "查看结果"}
          <ArrowRight />
        </Button>
      )}
    </div>
  );
}

function Results({ scene, lessonId, questions, hasNext, onRestart, onNext }: { scene: QuizScene; lessonId: string; questions: QuizQuestion[]; hasNext: boolean; onRestart: () => void; onNext: () => void }) {
  const answers = useProgress(lessonId).answers;
  const scores = questions.map((question, index) => {
    const answer = answers[answerKey(scene.id, index)];
    if (!answer) return 0;
    return question.type === "short" ? answer.score ?? 0 : answer.correct ? 100 : 0;
  });
  const total = Math.round(scores.reduce((sum, value) => sum + value, 0) / questions.length);

  // 看到结果就算这一页学完了
  useEffect(() => {
    updateProgress(lessonId, (progress) => (progress.completed.includes(scene.id) ? progress : { ...progress, completed: [...progress.completed, scene.id] }));
  }, [lessonId, scene.id]);

  return (
    <div className="flex flex-col gap-4">
      <div className={styles.panel}>
        <p className={styles.muted}>本页得分</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{total}</p>
        <div className={`${styles.scoreBar} mt-3`} role="img" aria-label={`得分 ${total} 分，满分 100`}>
          <span style={{ width: `${total}%` }} />
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {questions.map((question, index) => {
          const score = scores[index];
          const Icon = score >= 80 ? CircleCheck : score >= 40 ? CircleDot : CircleX;
          const tone = score >= 80 ? "text-success" : score >= 40 ? "text-warning" : "text-destructive";
          return (
            <li key={index} className={`${styles.row} items-start`}>
              <Icon className={`mt-1 size-4 shrink-0 ${tone}`} aria-label={score >= 80 ? "答对" : score >= 40 ? "部分对" : "没答对"} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-7">{question.prompt}</p>
                <p className={styles.muted}>考查：{question.point}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2">
        {hasNext && (
          <Button size="lg" onClick={onNext}>
            继续下一页
            <ArrowRight />
          </Button>
        )}
        <Button variant="ghost" onClick={onRestart}>
          <RotateCcw />
          重做本页
        </Button>
      </div>
    </div>
  );
}

export function QuizScene({ scene, lesson, hasNext, onNext }: { scene: QuizScene; lesson: Lesson; hasNext: boolean; onNext: () => void }) {
  const questions = scene.content!.questions;
  const progress = useProgress(lesson.id);
  // 回到做了一半的测验时，从第一道没做完的题继续；全部做完就直接看结果
  const [index, setIndex] = useState(() => {
    const first = questions.findIndex((question, i) => !isDone(question, progress.answers[answerKey(scene.id, i)]));
    return first < 0 ? questions.length : first;
  });

  function restart() {
    updateProgress(lesson.id, (current) => ({
      ...current,
      answers: Object.fromEntries(Object.entries(current.answers).filter(([key]) => !key.startsWith(`${scene.id}:`))),
      completed: current.completed.filter((id) => id !== scene.id),
    }));
    setIndex(0);
  }

  const question = questions[index];
  const props = { lessonId: lesson.id, sceneId: scene.id, total: questions.length, index, onContinue: () => setIndex(index + 1) };
  return (
    <div className="flex flex-col gap-4">
      <SceneHeader kind="quiz" title={scene.title} />
      {!question ? (
        <Results scene={scene} lessonId={lesson.id} questions={questions} hasNext={hasNext} onRestart={restart} onNext={onNext} />
      ) : question.type === "short" ? (
        <ShortQuestion key={index} question={question} {...props} />
      ) : (
        <ChoiceQuestion key={index} question={question} {...props} />
      )}
    </div>
  );
}
