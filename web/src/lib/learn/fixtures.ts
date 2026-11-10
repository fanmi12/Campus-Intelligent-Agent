import { LESSON_VERSION, type Lesson, type LessonScene } from "./schema";

// 演示课程：没配置大模型 Key 时，小狮课堂用它走通整个界面。
// 主题选「番茄工作法入门」：通用知识、不涉及任何校内事实，内容不会出错。

export const DEMO_LESSON_ID = "demo-pomodoro";

const CREATED_AT = Date.UTC(2026, 10, 9);

const scenes: LessonScene[] = [
  {
    id: "s1",
    kind: "slide",
    title: "番茄工作法是什么",
    goal: "知道番茄工作法的来历和核心做法",
    keyPoints: ["名字的来历", "专注 25 分钟加休息 5 分钟", "它能缓解什么问题"],
    status: "ready",
    content: {
      lead: "把时间切成 25 分钟的专注小块，一次只做一件事。",
      layout: "points",
      points: [
        { heading: "名字的来历", body: "发明者西里洛用番茄形的厨房定时器计时，意大利语里番茄叫 pomodoro。", sourceNumbers: [] },
        { heading: "核心做法", body: "专注 25 分钟，休息 5 分钟，这一轮叫一个番茄钟。", sourceNumbers: [] },
        { heading: "解决什么问题", body: "任务太大不想开始、做着做着就分心，都可以用它缓解。", sourceNumbers: [] },
      ],
      narration: [
        { point: -1, text: "同学你好，我是狮老师。这节课我们花十分钟，学一个很多人都在用的时间管理方法：番茄工作法。" },
        { point: 0, text: "它是意大利人西里洛在上世纪八十年代末想出来的。他当时用一个番茄形状的厨房定时器给自己计时，所以叫番茄工作法。" },
        { point: 1, text: "做法很简单：定时二十五分钟，这段时间里只做一件事；铃响之后休息五分钟。这样的一轮，就叫一个番茄钟。" },
        { point: 2, text: "很多同学不是不会学，而是迟迟不开始，或者学着学着就刷起手机。把时间切成小块，开始的门槛就低多了。" },
      ],
    },
  },
  {
    id: "s2",
    kind: "slide",
    title: "一个番茄钟怎么用",
    goal: "会按步骤完成一个完整的番茄钟",
    keyPoints: ["选任务", "定时 25 分钟", "专注到铃响", "休息 5 分钟", "四个一组长休息"],
    status: "ready",
    content: {
      lead: "照着五步走，就能完成一个完整的番茄钟。",
      layout: "steps",
      points: [
        { heading: "选一个任务", body: "开始前想清楚，这 25 分钟只做哪一件具体的事。", sourceNumbers: [] },
        { heading: "定时 25 分钟", body: "设好计时器，然后马上开始。", sourceNumbers: [] },
        { heading: "专注到铃响", body: "中途想到别的事，先记在纸上，铃响后再处理。", sourceNumbers: [] },
        { heading: "休息 5 分钟", body: "起身走动、喝口水，让大脑真正放松。", sourceNumbers: [] },
        { heading: "四个一组长休息", body: "完成 4 个番茄钟后，休息 15 到 30 分钟。", sourceNumbers: [] },
      ],
      example: {
        title: "例子：复习高数",
        body: "早上先估计：做完这一章习题大约要 3 个番茄钟。第一个只做例题，铃响休息；第二个做课后题；第三个整理错题。晚上再看看实际用了几个。",
      },
      narration: [
        { point: -1, text: "接下来我们看看，一个番茄钟具体怎么用。一共五步，跟着我走一遍。" },
        { point: 0, text: "第一步，先选任务。不要说“我要复习”，而要说“我这 25 分钟只做高数第三章的例题”，越具体越好。" },
        { point: 1, text: "第二步，设好二十五分钟的计时器，然后立刻开始，不要再犹豫。" },
        { point: 2, text: "第三步，专注到铃响。如果中途突然想到别的事，先记在纸上，铃响之后再去处理。" },
        { point: 3, text: "第四步，铃响就休息五分钟。站起来走动、喝口水，这五分钟别拿起手机。" },
        { point: 4, text: "最后，每完成四个番茄钟，就给自己一次十五到三十分钟的长休息，再开始下一轮。" },
      ],
    },
  },
  {
    id: "s3",
    kind: "quiz",
    title: "随堂小测",
    goal: "检验对规则的理解",
    keyPoints: ["番茄钟时长", "基本规则", "为什么有效"],
    status: "ready",
    content: {
      questions: [
        {
          type: "single",
          prompt: "一个标准的番茄钟，专注时间是多长？",
          options: ["15 分钟", "25 分钟", "45 分钟", "60 分钟"],
          answers: [1],
          reference: "",
          rubric: [],
          explanation: "标准的番茄钟是 25 分钟专注，之后休息 5 分钟。",
          point: "番茄钟时长",
        },
        {
          type: "multiple",
          prompt: "下面哪些做法符合番茄工作法？（多选）",
          options: ["开始前先选定一个具体任务", "铃响后先休息 5 分钟", "被打断后，把已过去的时间算半个番茄钟", "完成 4 个番茄钟后休息更久一些"],
          answers: [0, 1, 3],
          reference: "",
          rubric: [],
          explanation: "被打断时，这个番茄钟作废，要重新开始，不算半个。",
          point: "基本规则",
        },
        {
          type: "short",
          prompt: "用自己的话说说：为什么番茄工作法能帮助减少拖延？",
          options: [],
          answers: [],
          reference: "把任务切成 25 分钟的小块，开始的门槛变低；固定的休息让人不容易疲劳；完成的番茄钟可以记录下来，带来看得见的进展和成就感。",
          rubric: ["把大任务切成短时间块，降低开始的门槛", "固定休息，保持精力", "记录完成的番茄钟，获得进展感"],
          explanation: "关键是门槛低、节奏稳、有反馈。",
          point: "为什么有效",
        },
      ],
    },
  },
  {
    id: "s4",
    kind: "flashcards",
    title: "记忆闪卡",
    goal: "记住几个关键术语",
    keyPoints: ["番茄钟", "长休息", "打断", "估算"],
    status: "ready",
    content: {
      cards: [
        { front: "一个番茄钟", back: "25 分钟专注，加 5 分钟休息，是一个完整的循环。" },
        { front: "长休息", back: "每完成 4 个番茄钟之后，休息 15 到 30 分钟。", hint: "四个一组" },
        { front: "被打断了怎么办", back: "把打断记下来，这个番茄钟作废，之后重新开始。" },
        { front: "估算", back: "开始前估计任务要几个番茄钟，晚上对照实际用了几个。" },
        { front: "名字的来历", back: "发明者用番茄形的厨房定时器计时，pomodoro 是意大利语的番茄。" },
      ],
    },
  },
  {
    id: "s5",
    kind: "slide",
    title: "遇到问题怎么办",
    goal: "知道常见情况的处理办法",
    keyPoints: ["被打断", "任务太小或太大", "提前做完"],
    status: "ready",
    content: {
      lead: "用起来难免遇到状况，记住这几个对策就够了。",
      layout: "compare",
      points: [
        { heading: "被打断了", body: "把打断记下来，这个番茄钟作废，之后重新开始。", sourceNumbers: [] },
        { heading: "任务太小或太大", body: "太小就合并，太大就拆成几个番茄钟能完成的小块。", sourceNumbers: [] },
        { heading: "提前做完了", body: "用剩下的时间检查和复盘，等铃响再休息。", sourceNumbers: [] },
      ],
      table: {
        columns: ["情况", "怎么办"],
        rows: [
          ["被人打断", "记下打断，这个番茄钟作废，之后重来"],
          ["任务比较小", "几个小任务合并，放进同一个番茄钟"],
          ["任务太大", "拆成几个番茄钟能完成的小块"],
          ["提前做完", "检查、复盘，等铃响再休息"],
        ],
      },
      narration: [
        { point: -1, text: "刚才讲的是理想情况。真用起来，总会遇到各种状况，我们看三种最常见的。" },
        { point: 0, text: "最常见的是被打断。同学叫你，或者手机响了。这时把打断记下来，这个番茄钟就作废了，等有空再重新开始。" },
        { point: 1, text: "任务太小，几分钟就做完，就把几个小任务合并到一个番茄钟里；任务太大，就拆成几个番茄钟能完成的小块。" },
        { point: 2, text: "如果任务提前做完了，别急着休息。用剩下的时间检查一遍、复盘一下，等铃响再休息。" },
      ],
    },
  },
  {
    id: "s6",
    kind: "summary",
    title: "总结",
    goal: "回顾要点，知道下一步怎么做",
    keyPoints: ["规则", "步骤", "对策"],
    status: "ready",
    content: {
      recap: [
        "一个番茄钟是 25 分钟专注加 5 分钟休息",
        "开始前选定一个具体任务，一次只做一件事",
        "每完成 4 个番茄钟，休息 15 到 30 分钟",
        "被打断时这个番茄钟作废，之后重新开始",
      ],
      map: [
        { label: "是什么", children: ["25 分钟专注", "5 分钟休息"] },
        { label: "怎么用", children: ["选任务", "定时", "专注", "休息", "长休息"] },
        { label: "遇到问题", children: ["被打断", "任务太大", "提前做完"] },
      ],
      nextSteps: ["今天挑一件具体的事，试一个番茄钟", "晚上记下今天完成了几个番茄钟"],
      narration: [
        { point: -1, text: "好，这节课我们学完了。番茄工作法的核心，就是把时间切成小块，一次只做一件事。" },
        { point: 3, text: "最容易忘的一条是：被打断了，这个番茄钟就作废，不能算半个，要重新开始。" },
        { point: -1, text: "接下来不用等，今天就挑一件具体的事，试一个番茄钟吧。" },
      ],
    },
  },
];

export const demoLesson: Lesson = {
  id: DEMO_LESSON_ID,
  version: LESSON_VERSION,
  status: "ready",
  step: "done",
  topic: "番茄工作法入门",
  level: "入门",
  minutes: 10,
  grounding: "general",
  title: "番茄工作法入门",
  summary: "用 25 分钟一个的专注块对抗拖延：认识规则，学会用法，知道遇到问题怎么办。",
  audience: "总是拖到最后才开始的大学生",
  objectives: ["说出番茄钟的时长和步骤", "能为一项任务安排番茄钟", "知道被打断、任务太大等情况怎么处理"],
  scenes,
  sources: [],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  generatedMs: 0,
  demo: true,
};

// 开发预览用：在演示课程的基础上，加上出处、一页失败、一页还在编写，用来检查各种状态
export const previewLesson: Lesson = {
  ...demoLesson,
  id: "preview-lesson",
  status: "generating",
  step: "writing",
  grounding: "campus",
  demo: false,
  sources: [
    { n: 1, title: "示例资料（仅预览）", heading: "借阅规则", snippet: "这是预览用的示例文字，不是真实的学校资料。借书时请带好校园卡。", updated: "2026-01" },
    { n: 2, title: "示例资料（仅预览）", heading: "续借与归还", snippet: "这是预览用的示例文字，不是真实的学校资料。到期前可以在线续借一次。" },
  ],
  scenes: demoLesson.scenes.map((scene, index): LessonScene => {
    if (index === 0 && scene.kind === "slide" && scene.content) {
      return {
        ...scene,
        content: {
          ...scene.content,
          points: scene.content.points.map((point, pointIndex) => (pointIndex < 2 ? { ...point, sourceNumbers: [pointIndex + 1] } : point)),
        },
      };
    }
    if (index === 4) return { id: scene.id, kind: "slide", title: scene.title, goal: scene.goal, keyPoints: scene.keyPoints, status: "failed", error: "这一页没生成成功" };
    if (index === 5) return { id: scene.id, kind: "summary", title: scene.title, goal: scene.goal, keyPoints: scene.keyPoints, status: "generating" };
    return scene;
  }),
};
