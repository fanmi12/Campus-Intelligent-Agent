// 服务启动时自动同步一次知识库：改完 knowledge/ 里的资料，重启服务即可生效
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;

  const { ingestKnowledge } = await import("./lib/server/kb/ingest");
  const { warmSearchIndex } = await import("./lib/server/kb/search");
  // 不等待完成，避免拖慢启动；第一次请求时如果还没导入完，接口会自己补导一次
  ingestKnowledge()
    .then((report) => {
      console.log(
        `[kb] 知识库已同步：${report.files} 个文件，${report.chunks} 段（新增 ${report.added}，删除 ${report.removed}，新算向量 ${report.embedded}），用时 ${report.durationMs}ms`,
      );
      warmSearchIndex();
    })
    .catch((error) => console.error("[kb] 知识库同步失败：", error));
}
