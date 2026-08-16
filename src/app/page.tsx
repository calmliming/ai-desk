import Link from "next/link";
import HomeStats from "@/components/home-stats";
import {
  IconArrowRight,
  IconChat,
  IconCheck,
  IconCompare,
  IconFile,
  IconFolder,
  IconKey,
  IconPrompts,
  IconSparkle,
  IconTools,
} from "@/components/icons";

const FEATURES = [
  {
    href: "/chat",
    icon: IconChat,
    title: "AI 对话",
    desc: "流式聊天，多模型随时切换，会话历史本地保存。",
    ready: true,
  },
  {
    href: "/compare",
    icon: IconCompare,
    title: "模型对比",
    desc: "同一问题并发发送给多个模型，并排比较回答质量。",
    ready: true,
  },
  {
    href: "/tools",
    icon: IconTools,
    title: "文本工具",
    desc: "翻译、摘要、改写、代码解释等一键式快捷工具。",
    ready: true,
  },
  {
    href: "/prompts",
    icon: IconPrompts,
    title: "提示词库",
    desc: "收藏和管理常用提示词，变量填充，一键套用到对话或工具。",
    ready: true,
  },
  {
    href: "/chat",
    icon: IconFile,
    title: "文件对话",
    desc: "上传 PDF、文档或图片，让 AI 阅读内容并回答。",
    ready: true,
  },
  {
    href: "/projects",
    icon: IconFolder,
    title: "项目记录",
    desc: "简单记录每个项目在什么时间做了什么。",
    ready: true,
  },
  {
    href: "/settings",
    icon: IconKey,
    title: "提供商配置",
    desc: "管理 DeepSeek、OpenAI 等 API Key，密钥仅存本机。",
    ready: true,
  },
];

export default function Home() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="space-y-4 pt-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-orange-600 dark:text-amber-400">
          <IconSparkle width={14} height={14} />
          你的自托管 AI 工作台
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
              你好，欢迎使用{" "}
              <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 bg-clip-text text-transparent dark:from-amber-400 dark:via-orange-400 dark:to-amber-400">
                AIDesk
              </span>{" "}
              👋
            </h1>
            <p className="mt-3 text-zinc-600 dark:text-zinc-400">
              一个页面汇集主流大模型：对话、对比、写作工具与提示词库。
              API Key 只在你的浏览器里，随时开箱即用。
            </p>
          </div>
          <HomeStats />
        </div>
      </section>

      {/* 快速开始 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          快速开始
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "配置 API Key",
              desc: "在设置页填入 DeepSeek 或其他提供商的密钥。",
              href: "/settings",
            },
            {
              step: "2",
              title: "开始对话",
              desc: "进入 AI 对话，选择模型即可流式聊天。",
              href: "/chat",
            },
            {
              step: "3",
              title: "解锁高级玩法",
              desc: "多模型对比、文本工具、提示词库陆续上线。",
              href: "/compare",
            },
          ].map(({ step, title, desc, href }) => (
            <li key={step}>
              <Link
                href={href}
                className="group block h-full rounded-xl border border-zinc-200 p-4 transition-colors hover:border-amber-400/60 hover:bg-amber-500/5 dark:border-zinc-800"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-sm font-semibold text-white">
                  {step}
                </span>
                <p className="mt-3 font-medium">{title}</p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{desc}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* 功能卡片 */}
      <section>
        <div className="flex items-end justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            功能模块
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-600">点击卡片直接进入</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map(({ href, icon: Icon, title, desc, ready }) =>
            href ? (
              <Link
                key={title}
                href={href}
                className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-amber-400/60 hover:shadow-xl hover:shadow-amber-500/15 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-amber-500/40"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 text-orange-600 shadow-inner transition-transform group-hover:scale-110 dark:text-amber-400">
                    <Icon width={24} height={24} />
                  </span>
                  {ready ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      已就绪
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      开发中
                    </span>
                  )}
                </div>
                <p className="mt-4 text-lg font-medium">{title}</p>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {desc}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-orange-600 transition-all group-hover:gap-2 dark:text-amber-400">
                  进入 <IconArrowRight width={14} height={14} />
                </span>
              </Link>
            ) : (
              <div
                key={title}
                className="flex flex-col rounded-2xl border border-dashed border-zinc-200 bg-white/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/30"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-500/10 text-zinc-400">
                  <Icon width={24} height={24} />
                </span>
                <p className="mt-4 text-lg font-medium text-zinc-600 dark:text-zinc-300">{title}</p>
                <p className="mt-1.5 flex-1 text-sm text-zinc-400 dark:text-zinc-500">{desc}</p>
                <span className="mt-4 inline-flex w-fit rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                  规划中
                </span>
              </div>
            ),
          )}
        </div>
      </section>

      {/* 扩展能力 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          内置扩展能力
        </h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {[
            "会话搜索：按标题与消息内容检索历史会话",
            "对话导出：一键导出 Markdown / JSON",
            "Token 统计：每次回答与整个会话的用量",
            "角色预设：通用助手 / 代码专家 / 写作助手等",
            "参数调节：温度与最大输出长度，会话级生效",
            "快捷指令：对话中输入 /翻译、/总结 等",
          ].map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-sm text-zinc-600 dark:border-emerald-500/20 dark:text-zinc-300"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                <IconCheck width={10} height={10} strokeWidth={2.8} />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
