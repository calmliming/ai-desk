"use client";

import { usePrompts } from "@/lib/prompts-store";
import { useSessions } from "@/lib/sessions-store";
import { useAppSettings } from "@/lib/settings-store";

/** 首页实时统计（服务端渲染 0，水合后显示真实数据） */
export default function HomeStats() {
  const settings = useAppSettings();
  const sessions = useSessions();
  const prompts = usePrompts();

  const providersWithKey = Object.values(settings.providers).filter((p) => p.apiKey).length;

  const stats = [
    { value: sessions.length, label: "历史会话", hint: "localStorage" },
    { value: prompts.length, label: "提示词", hint: "含内置模板" },
    { value: providersWithKey, label: "已配置提供商", hint: "可随时切换" },
  ];

  return (
    <div className="grid shrink-0 grid-cols-3 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-2xl border border-zinc-200/80 bg-white/70 px-4 py-3 text-center shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/50"
        >
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-orange-600 dark:text-amber-400">
            {s.value}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{s.label}</p>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">{s.hint}</p>
        </div>
      ))}
    </div>
  );
}
