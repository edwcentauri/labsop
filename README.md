# Lab SOP

面向手机浏览的实验室 SOP、在线计算工具与站内 PDF 阅读网站。

## 内容维护

- SOP 与工具清单：`src/data.ts`
- 公告 Markdown：`src/content/`
- PDF 原文件：`public/pdfs/`
- 计算公式：`src/calculations.ts`

合并到 `main` 分支后，GitHub Actions 会运行计算测试并发布到 GitHub Pages。

## 本地运行

```bash
npm install
npm run generate:pdfs
npm run dev
```

示例 PDF 仅用于验证站内阅读器。正式使用前，请替换为经批准的实验室文件，并同步更新版本号与生效日期。
