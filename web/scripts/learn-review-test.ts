import assert from "node:assert/strict";
import { demoLesson, previewLesson } from "../src/lib/learn/fixtures";
import { lessonToMarkdown } from "../src/lib/learn/notes";
import { emptyProgress, isChoiceCorrect, scoreOf, weakPoints, type LessonProgress } from "../src/lib/learn/progress";
import type { QuizQuestion } from "../src/lib/learn/schema";
import { addDays, beijingToday, describeInterval, dueCards, lessonToReviewCards, newReviewCard, schedule, type ReviewCard } from "../src/lib/learn/review";

// 复习调度（简化 SM-2）、北京时间日期、学习得分与薄弱点、Markdown 笔记导出的离线测试。

const input = { key: "L:s4:0", lessonId: "L", lessonTitle: "示例课", front: "正面", back: "背面" };
const TODAY = "2026-11-09";

// ---------- 北京时间 ----------
assert.equal(beijingToday(new Date("2026-11-09T15:59:59Z")), "2026-11-09", "UTC 15:59 还是北京时间当天 23:59");
assert.equal(beijingToday(new Date("2026-11-09T16:00:00Z")), "2026-11-10", "UTC 16:00 已经是北京时间次日 0 点");
assert.equal(beijingToday(new Date("2026-12-31T20:00:00Z")), "2027-01-01", "跨年");
assert.equal(addDays("2026-11-30", 1), "2026-12-01");
assert.equal(addDays("2026-02-27", 2), "2026-03-01");
assert.equal(addDays("2026-11-09", 0), "2026-11-09");

// ---------- 新卡片与评分 ----------
const fresh = newReviewCard(input, TODAY, 1000);
assert.deepEqual([fresh.ease, fresh.interval, fresh.reps, fresh.lapses, fresh.due], [2.5, 0, 0, 0, TODAY], "新卡片今天就要复习");

// 连续「记得」：1 天 → 3 天 → 8 天 → 20 天，间隔逐次拉长
const good1 = schedule(fresh, "good", TODAY);
assert.deepEqual([good1.interval, good1.reps, good1.due], [1, 1, "2026-11-10"]);
const good2 = schedule(good1, "good", "2026-11-10");
assert.deepEqual([good2.interval, good2.reps, good2.due], [3, 2, "2026-11-13"]);
const good3 = schedule(good2, "good", "2026-11-13");
assert.deepEqual([good3.interval, good3.reps], [8, 3], "3 × 2.5 = 7.5 四舍五入");
const good4 = schedule(good3, "good", "2026-11-21");
assert.equal(good4.interval, 20);
assert.ok(good4.interval > good3.interval && good3.interval > good2.interval, "间隔递增");
assert.equal(good4.ease, 2.5, "「记得」不改变容易程度");

// 忘了：回到起点，今天再出现，容易程度下降
const lapsed = schedule(good3, "again", "2026-11-21");
assert.deepEqual([lapsed.reps, lapsed.lapses, lapsed.interval, lapsed.due], [0, 1, 0, "2026-11-21"]);
assert.equal(Math.round(lapsed.ease * 100) / 100, 2.3);
assert.equal(schedule(lapsed, "good", "2026-11-21").interval, 1, "忘了之后再记得，从 1 天重新开始");

// 模糊：间隔略微拉长，容易程度小降；间隔为 0 时至少 1 天
const hard = schedule(good3, "hard", "2026-11-21");
assert.deepEqual([hard.interval, Math.round(hard.ease * 100) / 100, hard.reps], [10, 2.35, 3], "8 × 1.2 = 9.6 → 10；连续记得次数不变");
assert.equal(schedule(fresh, "hard", TODAY).interval, 1);

// 很熟：比「记得」更长，容易程度上升
const easy = schedule(good1, "easy", "2026-11-10");
assert.deepEqual([easy.interval, Math.round(easy.ease * 100) / 100, easy.reps], [4, 2.65, 2], "「记得」是 3 天，「很熟」至少多 1 天");
assert.equal(schedule(fresh, "easy", TODAY).interval, 2, "第一次就很熟：2 天后");

// 容易程度最低 1.3
let weary: ReviewCard = fresh;
for (let index = 0; index < 12; index++) weary = schedule(weary, "again", TODAY);
assert.equal(weary.ease, 1.3);
assert.equal(weary.lapses, 12);
let hardRepeat: ReviewCard = { ...fresh, interval: 5 };
for (let index = 0; index < 20; index++) hardRepeat = schedule(hardRepeat, "hard", TODAY);
assert.equal(hardRepeat.ease, 1.3);

// 间隔上限 180 天
const veteran: ReviewCard = { ...fresh, reps: 6, interval: 150, ease: 2.6 };
assert.equal(schedule(veteran, "good", TODAY).interval, 180);
assert.equal(schedule(veteran, "easy", TODAY).interval, 180);
assert.equal(schedule(veteran, "good", TODAY).due, addDays(TODAY, 180));

// 纯函数：不改原对象
const snapshot = JSON.stringify(fresh);
schedule(fresh, "good", TODAY);
assert.equal(JSON.stringify(fresh), snapshot);

// ---------- 到期筛选与排序 ----------
const card = (key: string, due: string, updatedAt: number): ReviewCard => ({ ...fresh, key, due, updatedAt });
const pool = [card("later", "2026-11-12", 1), card("today-b", TODAY, 20), card("old", "2026-11-05", 5), card("today-a", TODAY, 10), card("tomorrow", "2026-11-10", 2)];
assert.deepEqual(dueCards(pool, TODAY).map((item) => item.key), ["old", "today-a", "today-b"], "只要今天及以前到期的；早到期的在前，同一天先复习的在前");
assert.deepEqual(dueCards(pool, "2026-11-10").map((item) => item.key), ["old", "today-a", "today-b", "tomorrow"], "次日再看，到期的变多");
assert.deepEqual(dueCards([], TODAY), []);
// 刚答「忘了」的卡片排到当天队尾
const redo = schedule({ ...fresh, key: "redo", due: "2026-11-05" }, "again", TODAY, 99_999);
assert.equal(dueCards([redo, card("other", TODAY, 50)], TODAY).at(-1)?.key, "redo");

// ---------- 间隔文字 ----------
assert.deepEqual([0, 1, 3, 59, 60, 90, 180].map(describeInterval), ["今天", "明天", "3 天后", "59 天后", "2 个月后", "3 个月后", "6 个月后"]);

// ---------- 把课程里的闪卡变成复习卡 ----------
const fromLesson = lessonToReviewCards(demoLesson);
assert.equal(fromLesson.length, 5, "演示课程的闪卡页有 5 张卡");
assert.deepEqual(fromLesson.map((item) => item.key), ["demo-pomodoro:s4:0", "demo-pomodoro:s4:1", "demo-pomodoro:s4:2", "demo-pomodoro:s4:3", "demo-pomodoro:s4:4"]);
assert.ok(fromLesson.every((item) => item.lessonId === "demo-pomodoro" && item.lessonTitle === "番茄工作法入门"));
const withCitation = { ...demoLesson, scenes: demoLesson.scenes.map((scene) => (scene.kind === "flashcards" && scene.content ? { ...scene, content: { cards: scene.content.cards.map((card, index) => (index === 0 ? { ...card, back: `${card.back}[1][3]` } : card)) } } : scene)) };
assert.ok(!lessonToReviewCards(withCitation as typeof demoLesson)[0].back.includes("["), "背面末尾的出处角标要去掉");
assert.equal(lessonToReviewCards({ ...demoLesson, scenes: demoLesson.scenes.filter((scene) => scene.kind !== "flashcards") }).length, 0, "没有闪卡页就没有复习卡");

// ---------- 选择题判分、得分、薄弱点 ----------
const single = { type: "single", answers: [1] } as unknown as QuizQuestion;
const multiple = { type: "multiple", answers: [0, 2, 3] } as unknown as QuizQuestion;
assert.ok(isChoiceCorrect(single, [1]) && !isChoiceCorrect(single, [0]) && !isChoiceCorrect(single, []));
assert.ok(isChoiceCorrect(multiple, [3, 0, 2]), "多选与顺序无关");
assert.ok(!isChoiceCorrect(multiple, [0, 2]) && !isChoiceCorrect(multiple, [0, 2, 3, 1]), "少选、多选都不算对");

const quiz = demoLesson.scenes.find((scene) => scene.kind === "quiz")!;
assert.equal(scoreOf(demoLesson, emptyProgress()), 0, "还没作答，按 0 分");
const answered: LessonProgress = {
  ...emptyProgress(1),
  answers: {
    [`${quiz.id}:0`]: { choice: [1], correct: true },
    [`${quiz.id}:1`]: { choice: [0], correct: false },
    [`${quiz.id}:2`]: { text: "把任务切小块", score: 50, graded: "ai" },
  },
};
assert.equal(scoreOf(demoLesson, answered), 50, "(1 + 0 + 0.5) / 3 = 50 分");
assert.deepEqual(weakPoints(demoLesson, answered), ["基本规则", "为什么有效"], "答错和只答对一部分的题目的知识点");
const perfect: LessonProgress = { ...answered, answers: { ...answered.answers, [`${quiz.id}:1`]: { choice: [0, 1, 3], correct: true }, [`${quiz.id}:2`]: { text: "…", score: 100, graded: "ai" } } };
assert.equal(scoreOf(demoLesson, perfect), 100);
assert.deepEqual(weakPoints(demoLesson, perfect), []);
assert.equal(scoreOf({ ...demoLesson, scenes: demoLesson.scenes.filter((scene) => scene.kind !== "quiz") }, answered), null, "没有测验题时没有得分");

// ---------- Markdown 笔记 ----------
const notes = lessonToMarkdown(demoLesson);
assert.ok(notes.startsWith("# 番茄工作法入门\n"), "标题");
for (const scene of demoLesson.scenes) assert.ok(notes.includes(`## ${demoLesson.scenes.indexOf(scene) + 1}. ${scene.title}`), `包含第 ${scene.id} 页标题`);
assert.ok(notes.includes("> 用 25 分钟一个的专注块对抗拖延"), "课程简介");
assert.ok(notes.includes("依据：通用知识"), "依据标注");
assert.ok(notes.includes("## 学习目标\n1. 说出番茄钟的时长和步骤"), "学习目标");
assert.ok(notes.includes("- **名字的来历**：发明者西里洛用番茄形的厨房定时器计时"), "讲解要点");
assert.ok(notes.includes("| 情况 | 怎么办 |\n|---|---|\n| 被人打断 | 记下打断，这个番茄钟作废，之后重来 |"), "讲解页里的表格");
assert.ok(notes.includes("> **例子：复习高数**："), "例子引用块");
assert.ok(notes.includes("1. 一个标准的番茄钟，专注时间是多长？\n   - A. 15 分钟\n   - B. 25 分钟"), "测验题和选项");
assert.ok(notes.includes("   - 答案：B　解析：标准的番茄钟是 25 分钟专注"), "测验答案和解析");
assert.ok(notes.includes("   - 答案：A、B、D　解析："), "多选题答案");
assert.ok(notes.includes("   - 参考答案：把任务切成 25 分钟的小块") && notes.includes("   - 得分点："), "简答题参考答案和得分点");
assert.ok(notes.includes("| 正面 | 背面 |\n|---|---|\n| 一个番茄钟 | 25 分钟专注，加 5 分钟休息，是一个完整的循环。 |"), "闪卡表格");
assert.ok(notes.includes("### 知识结构\n- 是什么\n  - 25 分钟专注"), "知识结构");
assert.ok(notes.includes("### 下一步\n- 今天挑一件具体的事"), "下一步");
assert.ok(notes.trimEnd().endsWith("由城院小狮 · 小狮课堂生成，重要事项以学校官方通知为准。"), "页脚");
assert.ok(!notes.includes("## 参考资料"), "通用课程没有参考资料");
assert.ok(!notes.includes("我的答案"), "没有进度时不带作答");

const withProgress = lessonToMarkdown(demoLesson, answered);
assert.ok(withProgress.includes("- 我的测验得分：50（共 3 题）"));
assert.ok(withProgress.includes("   - 我的答案：B · 答对了") && withProgress.includes("   - 我的答案：A · 答错了"));
assert.ok(withProgress.includes("   - 我的答案：把任务切小块 · 得分：50"));

const cited = lessonToMarkdown(previewLesson);
assert.ok(cited.includes("## 参考资料\n[1] 《示例资料（仅预览）》 › 借阅规则（更新于 2026-01）"), "参考资料带编号、小标题和更新日期");
assert.ok(cited.includes("## 5. 遇到问题怎么办\n（这一页没有生成成功）"), "失败的页面注明没有生成");
assert.ok(cited.includes("依据：校园资料"));
const pipe = lessonToMarkdown({ ...demoLesson, scenes: [{ ...demoLesson.scenes[3], content: { cards: [{ front: "a|b", back: "第一行\n第二行" }, { front: "c", back: "d" }, { front: "e", back: "f" }] } } as never] });
assert.ok(pipe.includes("| a\\|b | 第一行 第二行 |"), "表格单元格里的竖线要转义，换行变空格");

console.log("PASS: SM-2 scheduling (intervals, ease floor, 180-day cap, again/hard/easy), Beijing dates, due ordering, quiz scoring and weak points, Markdown notes export");
