# Lab SOP

面向手机浏览的实验室 SOP、在线计算工具与站内 PDF 阅读网站。

## 内容维护

- SOP 与工具清单：`src/data.ts`
- 公告 Markdown：`src/content/`
- PDF 原文件：`public/pdfs/`
- 计算公式：`src/calculations.ts`
- 工具创建规范：`docs/tool-creation-standard.md`

合并到 `main` 分支后，GitHub Actions 会运行计算测试并发布到 GitHub Pages。

## 本地运行

```bash
npm install
npm run dev
```

新增在线工具前，必须取得经批准的 SOP 来源，并按工具创建规范同步维护内容、计算逻辑、测试、路由、样式和 PDF 元数据。
