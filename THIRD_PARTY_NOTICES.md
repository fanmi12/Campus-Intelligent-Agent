# 许可范围与第三方来源

根目录的 [MIT 许可证](LICENSE)适用于本项目原创的应用程序代码、配置模板、维护脚本和项目文档。第三方代码、引用资料与外部图片不因此变更许可或权利归属。

MIT 许可证原文参见 [Open Source Initiative](https://opensource.org/license/mit)。

## MediaCrawler

- 上游仓库：[NanmiCoder/MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)。
- 引入版本：[`8f583999006d5b692272c608440e193ca282e73b`](https://github.com/NanmiCoder/MediaCrawler/tree/8f583999006d5b692272c608440e193ca282e73b)。
- 本仓库路径：[`crawlers/MediaCrawler/`](crawlers/MediaCrawler/)。
- 上游版权声明：`Copyright (c) [2024] [relakkes@gmail.com]`。
- 主许可文件：[`crawlers/MediaCrawler/LICENSE`](crawlers/MediaCrawler/LICENSE)，名称为 `NON-COMMERCIAL LEARNING LICENSE 1.1`（非商业学习使用许可证 1.1）。

该许可证限定非商业学习和研究用途，包含保留版权声明、不得大规模爬取或干扰平台运行，以及商业使用需取得版权所有者书面同意等条款。以所附许可原文为准；本项目的 MIT 许可不替代这些条款。

上游的 `webui/` 子目录另附 [GNU GPL version 3](crawlers/MediaCrawler/webui/LICENSE)；该文件及原有署名保留。各部分应按对应许可文件使用，不能把整个采集工具视为 MIT。

引入来源、版本和本地调整记录见 [`crawlers/migration.json`](crawlers/migration.json)。采集工具作为独立流程保留，启动 `web/` 应用无需运行它。

## 校园知识资料

[`web/knowledge/`](web/knowledge/) 包含公开校园资料的整理、页面清洗结果、附件转写和餐饮资料。原始通知、网页正文、附件及被引用的内容，其权利归对应发布机构或作者；本仓库不声称拥有这些来源内容的全部版权，也不将其统一授予 MIT 许可。

资料的原始出处与更新时间以 Markdown 文件头的 `source`、`updated` 及正文标注为准。转写与整理可能存在误差；办理事项和时效信息请核对原始发布内容。

## 外部图片与餐饮资料

以下内容不在本项目 MIT 许可的授权范围内：

- [`web/public/knowledge-food/`](web/public/knowledge-food/) 中的外部餐品照片。
- [`web/public/previews/food/`](web/public/previews/food/) 中的餐饮预览图片。
- [`web/src/lib/campus-food.generated.json`](web/src/lib/campus-food.generated.json) 中源自外部材料的描述、评价与图片关联数据。
- [`docs/images/`](docs/images/) 的界面截图中包含的外部照片、引用文本等第三方内容。

餐品照片与描述的来源、历史日期可从餐食目录的 `imageSource`、`source`、`reviewSource`、`photoDate` 等字段以及对应知识库文件追溯。公开仓库不额外授予这些内容的商业使用或再许可权。

## 软件依赖

应用与采集工具通过各自的依赖清单和锁文件安装第三方库。这些库继续遵循各自上游的许可证，根目录的 MIT 许可不会替代它们。
