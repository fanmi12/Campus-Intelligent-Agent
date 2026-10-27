"use client";

import { ArrowLeft, ArrowRight, Check, RotateCcw, RotateCw } from "lucide-react";
import { useId, useState } from "react";
import type { StudyData } from "@/lib/ai/result-schemas";
import styles from "./results.module.css";

export function StudyCards({ data }: { data: StudyData }) {
  const words = data.words;
  const quizId = useId();
  const [mode, setMode] = useState<"cards" | "quiz">("cards");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<number[]>([]);
  const [question, setQuestion] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const word = words[index];
  const quiz = words[question];
  const score = words.filter((item, i) => answers[i] === item.answer).length;

  function moveCard(offset: number) { setIndex((value) => value + offset); setFlipped(false); }
  function resetQuiz() { setQuestion(0); setChoice(null); setSubmitted(false); setAnswers({}); setFinished(false); }

  return (
    <article className={styles.card} aria-label="英语复习工具">
      <div className={styles.body}>
        <div className="flex items-center justify-between gap-2"><h3 className={styles.title}>{data.title}</h3><span className={styles.muted}>{words.length} 个词</span></div>
        <div className={styles.segmented}><button type="button" aria-pressed={mode === "cards"} onClick={() => setMode("cards")}>翻面单词卡</button><button type="button" aria-pressed={mode === "quiz"} onClick={() => setMode("quiz")}>做个小测验</button></div>
        {mode === "cards" ? <>
          <button type="button" className={styles.flashcard} data-flipped={flipped} aria-label={`${flipped ? "返回单词" : "翻看释义"}：${word.word}`} onClick={() => setFlipped((value) => !value)}>
            <span className={styles.flashInner}>
              <span className={styles.flashFront} aria-hidden={flipped}><strong>{word.word}</strong><span>{word.pronunciation}</span><span className={styles.flipHint}><RotateCw className="size-3.5" />点击翻面</span></span>
              <span className={styles.flashBack} aria-hidden={!flipped}><strong>{word.meaning}</strong><span>{word.example}</span><span>{word.translation}</span><span className={styles.flipHint}><RotateCw className="size-3.5" />点击返回</span></span>
            </span>
          </button>
          <div className={styles.foodPaging}><button type="button" className={styles.iconButton} aria-label="上一个单词" disabled={index === 0} onClick={() => moveCard(-1)}><ArrowLeft className="size-4" /></button><span className={styles.muted} aria-live="polite">{index + 1} / {words.length} · 已掌握 {known.length} 个</span><button type="button" className={styles.iconButton} aria-label="下一个单词" disabled={index === words.length - 1} onClick={() => moveCard(1)}><ArrowRight className="size-4" /></button></div>
          <button type="button" className={styles.secondary} aria-pressed={known.includes(index)} onClick={() => setKnown((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}><Check className="size-4" />{known.includes(index) ? "已掌握，点击撤销" : "这个词我记住了"}</button>
        </> : finished ? <div className={styles.quizFinished}><Check className="size-8 text-success" /><h4>这一轮复习完成了</h4><p>答对 {score} / {words.length} 题</p><button type="button" className={styles.secondary} onClick={resetQuiz}><RotateCcw className="size-3.5" />再练一次</button></div> : <>
          <p className={styles.muted}>第 {question + 1} / {words.length} 题</p>
          <fieldset className={styles.quiz}><legend>{quiz.question}</legend>{quiz.options.map((option, i) => <label key={option} data-selected={choice === i} data-correct={submitted && i === quiz.answer}><input type="radio" name={`study-${quizId}-${question}`} value={i} checked={choice === i} disabled={submitted} onChange={() => setChoice(i)} /><span>{String.fromCharCode(65 + i)}.</span>{option}{submitted && i === quiz.answer && <Check className="ml-auto size-4" />}</label>)}</fieldset>
          {submitted && <p role="status" className={styles.quizFeedback}>{choice === quiz.answer ? "答对了！" : `正确答案是「${quiz.options[quiz.answer]}」。`}{quiz.word}：{quiz.meaning}。</p>}
          {submitted ? <button type="button" className={styles.primary} onClick={() => { if (question === words.length - 1) setFinished(true); else { setQuestion((value) => value + 1); setChoice(null); setSubmitted(false); } }}>{question === words.length - 1 ? "查看本轮结果" : "下一题"}<ArrowRight className="size-4" /></button> : <button type="button" className={styles.primary} disabled={choice === null} onClick={() => { if (choice !== null) { setAnswers((current) => ({ ...current, [question]: choice })); setSubmitted(true); } }}>检查答案</button>}
        </>}
      </div>
    </article>
  );
}

