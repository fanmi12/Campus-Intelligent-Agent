import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 课程存储与配额的离线测试。env.ts 在模块加载时读取环境变量，
// 所以先把数据目录指到临时目录、调小几个限额，再用动态 import 加载被测模块。
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learn-store-test-"));
process.env.DATA_DIR = dir;
process.env.LEARN_DAILY_LIMIT = "3";
process.env.LEARN_CONCURRENCY = "2";
process.env.LEARN_QUEUE_CAPACITY = "1";
process.env.LEARN_IP_ACTIVE_LIMIT = "2";

async function main() {
  const store = await import("../src/lib/server/learn/store");
  const jobs = await import("../src/lib/server/learn/jobs");
  const quota = await import("../src/lib/server/learn/quota");
  const { getDb } = await import("../src/lib/server/db");
  const { LESSON_ID } = await import("../src/lib/learn/schema");
  const { DEMO_LESSON_ID } = await import("../src/lib/learn/fixtures");
  const db = getDb();
  const setUpdated = (id: string, ms: number) => db.prepare("UPDATE lessons SET updated_at = ? WHERE id = ?").run(ms, id);
  const setCreated = (id: string, ms: number) => db.prepare("UPDATE lessons SET created_at = ? WHERE id = ?").run(ms, id);
  const base = { level: "入门" as const, minutes: 10 as const, grounding: "general" as const };

  try {
    // ---------- 创建 / 读取 / 保存 / 删除 ----------
    const material = "这是只给服务端生成用的资料原文，不能出现在课程里";
    const lesson = store.createLessonRecord({ ...base, topic: "图".repeat(40), clientId: "client-a-0001", material });
    assert.match(lesson.id, LESSON_ID);
    assert.equal(lesson.id.length, 12);
    assert.deepEqual([lesson.status, lesson.step], ["generating", "queued"]);
    assert.equal(lesson.title.length, 30, "大纲出来前标题取主题的前 30 字");
    assert.equal(store.getLessonOwner(lesson.id), "client-a-0001");
    assert.equal(store.getMaterial(lesson.id), material);
    const loaded = store.getLesson(lesson.id)!;
    assert.equal(loaded.topic, lesson.topic);
    assert.ok(!JSON.stringify(loaded).includes(material), "资料原文不会出现在课程 JSON 里");
    assert.equal(store.getLesson("not-exist-1"), null);
    assert.equal(store.getLessonOwner("not-exist-1"), null);

    const before = loaded.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    loaded.title = "新标题";
    loaded.status = "ready";
    loaded.scenes = [{ id: "s1", kind: "slide", title: "第一页", goal: "目标", keyPoints: ["要点"], status: "ready" }];
    store.saveLesson(loaded);
    const saved = store.getLesson(lesson.id)!;
    assert.deepEqual([saved.title, saved.status, saved.scenes.length], ["新标题", "ready", 1]);
    assert.ok(saved.updatedAt > before, "保存会更新 updatedAt");
    const huge = { ...saved, summary: "字".repeat(200_000) };
    assert.throws(() => store.saveLesson(huge), /过大/);
    assert.equal(store.getLesson(lesson.id)!.summary, "", "超限的保存不会写入");

    // ---------- 摘要 ----------
    const second = store.createLessonRecord({ ...base, topic: "第二节课", clientId: "client-a-0001" });
    const summaries = store.listSummaries([second.id, "not-exist-1", lesson.id, second.id, DEMO_LESSON_ID]);
    assert.deepEqual(summaries.map((item) => item.id), [second.id, lesson.id, DEMO_LESSON_ID], "按传入顺序、去重、跳过不存在的，内置课程也在");
    assert.deepEqual([summaries[1].done, summaries[1].total], [1, 1]);
    assert.equal(summaries[2].total, 6);
    assert.equal(store.listSummaries(Array.from({ length: 40 }, (_, index) => `id-${index}-xxxx`)).length, 0);
    assert.equal(store.getLesson(DEMO_LESSON_ID)?.demo, true, "演示课程不进数据库也能读到");

    // ---------- 配额统计 ----------
    store.createLessonRecord({ ...base, topic: "别人的课", clientId: "client-b-0001" });
    assert.equal(store.countRecentByClient("client-a-0001", 0), 2);
    assert.equal(store.countRecentByClient("client-b-0001", 0), 1);
    assert.equal(store.countRecentByClient("client-a-0001", Date.now() + 60_000), 0, "只统计 sinceMs 之后创建的");

    // ---------- 正在备课 & 中断检测 ----------
    assert.equal(store.hasActiveLesson("client-a-0001"), true, "second 刚创建，仍在生成");
    assert.equal(store.hasActiveLesson("client-c-0001"), false);
    const stale = Date.now() - 4 * 60_000;
    setUpdated(second.id, stale);
    assert.equal(store.hasActiveLesson("client-a-0001"), false, "3 分钟没动静且本进程没在跑，不算正在备课");
    jobs.learnJobs.set(second.id, new AbortController());
    assert.equal(store.hasActiveLesson("client-a-0001"), true, "本进程里有任务在跑就算");
    assert.equal(store.getLesson(second.id)!.status, "generating", "任务在跑时不会被判中断");
    // 写到一半的页面：中断后重新排队（任务还登记着时写入，免得读取时先被判中断）
    const half = store.getLesson(second.id)!;
    half.scenes = [
      { id: "s1", kind: "slide", title: "一", goal: "g", keyPoints: ["k"], status: "ready" },
      { id: "s2", kind: "quiz", title: "二", goal: "g", keyPoints: ["k"], status: "generating" },
    ];
    store.saveLesson(half);
    jobs.learnJobs.delete(second.id);
    setUpdated(second.id, stale);
    const interrupted = store.getLesson(second.id)!;
    assert.equal(interrupted.status, "failed");
    assert.equal(interrupted.error, store.INTERRUPTED_MESSAGE);
    assert.deepEqual(interrupted.scenes.map((item) => item.status), ["ready", "pending"]);
    assert.equal(store.getLesson(second.id)!.status, "failed", "判定结果已保存");
    assert.equal(store.listSummaries([second.id])[0].status, "failed");

    // ---------- 资料 7 天后清空 ----------
    const old = store.createLessonRecord({ ...base, topic: "旧课程", clientId: "client-d-0001", material: "旧资料" });
    setCreated(old.id, Date.now() - 8 * 86_400_000);
    assert.equal(store.purgeExpiredMaterials(), 1);
    assert.equal(store.getMaterial(old.id), null);
    assert.equal(store.getMaterial(lesson.id), material, "7 天内的资料保留");
    assert.equal(store.purgeExpiredMaterials(), 0);

    // ---------- 行为事件与统计 ----------
    store.recordLessonEvent({ lessonId: lesson.id, clientId: "client-a-0001", type: "view" });
    store.recordLessonEvent({ lessonId: lesson.id, type: "finish", value: 80 });
    store.recordLessonEvent({ lessonId: lesson.id, type: "finish", value: 100 });
    store.incrementViews(lesson.id);
    store.incrementViews(lesson.id);
    const withTime = store.getLesson(lesson.id)!;
    withTime.generatedMs = 40_000;
    store.saveLesson(withTime);
    const stats = store.getLearnStats(0);
    assert.equal(stats.generated, 4, "lesson、second、别人的课、旧课程");
    assert.deepEqual([stats.ready, stats.failed], [1, 1]);
    assert.deepEqual([stats.finished, stats.avgScore, stats.avgGenerateMs], [2, 90, 40_000]);
    assert.equal(stats.recent.find((item) => item.id === lesson.id)?.views, 2);
    assert.equal(store.getLearnStats(Date.now() + 60_000).generated, 0);
    assert.equal(store.getLearnStats(Date.now() + 60_000).avgScore, null);

    // ---------- 删除 ----------
    store.deleteLesson(lesson.id);
    assert.equal(store.getLesson(lesson.id), null);
    assert.equal(store.getMaterial(lesson.id), null);

    // ---------- 配额：一人一节、每日上限 ----------
    const owner = (client: string, ip = "192.0.2.50") => ({ client, ip });
    assert.equal(quota.checkLessonQuota(owner("client-c-0001")), null);
    const busy = store.createLessonRecord({ ...base, topic: "正在备课", clientId: "client-c-0001" });
    assert.match(quota.checkLessonQuota(owner("client-c-0001")) ?? "", /还有一节课正在备课/);
    for (let index = 0; index < 2; index++) store.createLessonRecord({ ...base, topic: `第 ${index} 节`, clientId: "client-c-0001" });
    for (const id of db.prepare("SELECT id FROM lessons WHERE client_id = 'client-c-0001'").all() as { id: string }[]) {
      const done = store.getLesson(id.id)!;
      done.status = "ready";
      store.saveLesson(done);
    }
    assert.equal(busy.id.length, 12);
    assert.match(quota.checkLessonQuota(owner("client-c-0001")) ?? "", /今天生成的课程有点多了/, "24 小时内已建 3 节，达到每日上限");
    assert.equal(quota.checkLessonQuota(owner("client-e-0001")), null, "别的浏览器不受影响");

    // ---------- 备课队列：并发 2、排队上限 1、每个出口最多 2 个 ----------
    const noop = () => {};
    const open = () => new AbortController().signal;
    const a = { client: "q-a-00001", ip: "192.0.2.7" };
    const b = { client: "q-b-00001", ip: "192.0.2.7" };
    const releaseA = await quota.lessonQueue.acquire(open(), noop, a);
    assert.match(quota.lessonQueue.check(a) ?? "", /还有一节课正在备课/, "同一浏览器同时只能备一节");
    const releaseB = await quota.lessonQueue.acquire(open(), noop, b);
    assert.match(quota.lessonQueue.check({ client: "q-c-00001", ip: "192.0.2.7" }) ?? "", /当前网络下备课的人太多了/, "同一出口同时备课到上限");
    const waiting = new AbortController();
    const pending = quota.lessonQueue.acquire(waiting.signal, noop, { client: "q-d-00001", ip: "198.51.100.9" });
    const cancelled = assert.rejects(pending, /已取消备课/);
    assert.match(quota.lessonQueue.check({ client: "q-e-00001", ip: "203.0.113.5" }) ?? "", /正在备课的同学太多了/, "排队人数到上限");
    waiting.abort();
    await cancelled;
    assert.equal(quota.lessonQueue.check({ client: "q-e-00001", ip: "203.0.113.5" }), null, "取消排队后名额归还");
    releaseA();
    releaseB();

    console.log("PASS: lesson CRUD, summaries, quota counters, interruption detection, material purge, events/stats, quota and queue limits");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
