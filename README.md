# 东莞城市学院智能体设计大赛 · 参赛项目

- [`web/`](web/README.md)：智能体网页版（前端 + 后端 + 知识库 + 管理后台 + 部署配置）
- `docs/`：设计方案、用户体验评测报告、答辩材料等（待补充）

## 仓库内容

仓库保留 `web/` 应用源码、整理后的知识库与静态资源，以及 `scripts/` 采集和维护脚本、`crawlers/` 采集工具。运行方式见 [web/README.md](web/README.md)，采集说明见 [crawlers/README.md](crawlers/README.md)。

本地环境变量、密钥、浏览器登录态、依赖目录、构建缓存和 SQLite 数据库不进入 Git。原始采集数据 `data/`、过程文件 `output/` 与交付产物 `outputs/` 也保留在本地。新环境需复制 `web/.env.example` 配置环境变量，首次运行时从 `web/knowledge/` 导入知识库；原始采集数据和既有运行记录需另行迁移。
