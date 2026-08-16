# AIDesk · AI 工作台

自用的多模型 AI 工作台 Web 应用：AI 对话、多模型对比、文本工具、提示词库与文件对话。

## 技术栈

- **Next.js 16.3.1**（App Router + Turbopack）
- **React 19.2.8** / TypeScript 5.9
- **Tailwind CSS 4.3**
- 包管理器：pnpm

## 快速开始

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm build          # 生产构建
pnpm lint           # 代码检查
pnpm generate:icons # 重新生成站点图标（icon.svg / icon.png / apple-icon.png）
```

首次使用：进入「设置」页，选择一个提供商（DeepSeek / OpenAI / Moonshot / 通义千问 / 自定义
OpenAI 兼容接口）并填入 API Key。密钥仅保存在浏览器 localStorage，不写入代码库。

## 功能路线

- [x] 应用骨架：侧边栏导航、深浅色主题、提供商设置页
- [x] AI 对话：流式输出、多会话历史、Markdown 渲染 + 代码高亮
- [x] 多模型对比：并发请求、并排展示、复制回答
- [x] 文本工具：翻译 / 摘要 / 改写 / 代码解释 + 对话内 /快捷指令
- [x] 提示词库：变量占位、一键套用、导入导出、内置模板
- [x] 文件对话：PDF 文本提取、文本文件、图片视觉输入
- [x] 扩展：会话搜索 / Markdown・JSON 导出、Token 统计、角色预设、温度与最大输出参数
