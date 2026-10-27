export {};

// 命令行导入知识库：pnpm kb:ingest
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // 文件不存在就跳过
  }
}

async function main() {
  const { ingestKnowledge } = await import("../src/lib/server/kb/ingest");
  let lastLog = 0;
  const report = await ingestKnowledge((done, total) => {
    if (Date.now() - lastLog > 3000 || done === total) {
      lastLog = Date.now();
      console.log(`  正在计算向量：${done} / ${total}（${Math.round((done / total) * 100)}%）`);
    }
  });
  console.log(
    `知识库导入完成：${report.files} 个文件，${report.chunks} 段（新增 ${report.added}，删除 ${report.removed}，新算向量 ${report.embedded}），用时 ${(report.durationMs / 1000).toFixed(1)} 秒` +
      (report.embeddingModel ? `（向量模型：${report.embeddingModel}）` : "（未配置向量模型，仅关键词检索）"),
  );
}

main().catch((error) => {
  console.error("导入失败：", error);
  process.exit(1);
});
