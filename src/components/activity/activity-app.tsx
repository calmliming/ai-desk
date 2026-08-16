"use client";

import { useState } from "react";
import {
  ACTIVITY_META,
  clearActivity,
  useActivity,
  type ActivityType,
} from "@/lib/activity-store";
import { IconHistory, IconTrash } from "../icons";

type Filter = ActivityType | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "chat", label: "💬 对话" },
  { id: "tool", label: "🛠️ 工具" },
  { id: "compare", label: "⚖️ 对比" },
  { id: "prompt", label: "📌 提示词" },
  { id: "settings", label: "⚙️ 设置" },
  { id: "file", label: "📎 文件" },
  { id: "session", label: "🗂️ 会话" },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `今天 ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

export default function ActivityApp() {
  const activity = useActivity();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = filter === "all" ? activity : activity.filter((a) => a.type === filter);

  const handleClear = () => {
    if (!window.confirm("确定清空全部操作记录？此操作不可恢复。")) return;
    clearActivity();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">操作记录</h1>
          <p className="mt-1.5 text-zinc-600 dark:text-zinc-400">
            共 {activity.length} 条记录，仅保存在本机浏览器，最多保留 300 条。
          </p>
        </div>
        {activity.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-500 transition-colors hover:bg-red-500/10"
          >
            <IconTrash width={14} height={14} />
            清空记录
          </button>
        )}
      </header>

      {/* 类型筛选 */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-orange-600 text-white shadow-sm"
                : "border border-zinc-300 text-zinc-600 hover:border-amber-500/60 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 时间线 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-orange-600 dark:text-amber-400">
            <IconHistory width={26} height={26} />
          </span>
          <p className="font-medium text-zinc-600 dark:text-zinc-300">
            {activity.length === 0 ? "暂无操作记录" : "该类型下暂无记录"}
          </p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            发送消息、执行工具、修改配置等操作都会自动记录在这里。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const meta = ACTIVITY_META[entry.type];
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-amber-500/40 dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-sm">
                  {meta.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="text-sm font-medium">{entry.title}</p>
                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {meta.label}
                    </span>
                  </div>
                  {entry.detail && (
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-all text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {entry.detail}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-600">
                  {formatTime(entry.time)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
