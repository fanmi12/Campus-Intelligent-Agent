# 校园美食采集

`MediaCrawler/` 从本机已有项目复制，保留原项目 LICENSE 和代码署名。来源与版本见 `migration.json`，原目录保持原样。登录态仅保存在被 Git 忽略的 `MediaCrawler/browser_data/` 中，不放入数据交付包。

安装依赖和使用上游命令请参照 [MediaCrawler/README.md](MediaCrawler/README.md)。本项目机器专用的采集与登录脚本仅在本地保留，不随公开仓库提供。网页应用使用整理后的 `web/knowledge/`，启动应用无需运行爬虫。

历史本地采集流程默认采集 5 个“东莞城市学院美食／食堂”关键词，每词最多 2 页、全局最多 70 条视频、每条最多 30 条一级评论和 10 条回复，并发 1，请求间隔 2 秒。按 API 实际 cursor 翻页，避免固定页长造成重复；连接失败重试一次，连续 3 个视频失败即保存进度并停止。

输出目录是 `data/social/douyin/YYYY-MM-DD/`：

- `jsonl/search_contents_日期.jsonl`：按 `aweme_id` 去重的视频描述与来源。
- `jsonl/search_comments_日期.jsonl`：按 `comment_id` 去重，`parent_comment_id` 关联回复。
- `manifest.json`：实际数量、搜索覆盖、评论进度、错误和阻塞原因。
- `source_text.md`：便于人工阅读的正文与评论。
- `raw/douyin/jsonl/`：保留各次标准化原始观察。

相同日期重跑会重新查询搜索结果，跳过已完成的视频评论，补抓失败项；导出时再次去重。扩展评论上限时，应另开日期目录或清除对应视频的 `comment_results` 进度后重跑。

若 `search_nil_info.search_nil_type` 是 `verify_check`，表示抖音要求人工验证，不等于关键词没有结果。程序记录 `partial`，停止后续搜索并保存已有数据。Chrome 首页正常或保留登录态，不能单独证明搜索验证已解除；应以搜索接口重新返回实际内容为准。

采集对象为视频描述及有限评论，没有下载视频，也没有转写视频语音或识别视频画面文字。帖子中的价格、营业情况和评价属于发布时间的用户陈述，不能当成当前实地核实结果。小红书原包已解压保存在 `data/social/xhs/2026-10-25/`。
