"use client";

import { useState } from "react";
import { findRoleByPrompt, roleNameById } from "@/lib/roles";
import type { Session } from "@/lib/sessions-store";
import { IconPlus, IconTrash } from "../icons";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

export default function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = sessions.filter(
    (s) =>
      !query.trim() ||
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      s.messages.some((m) => m.content.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
      <div className="space-y-2 border-b border-zinc-200 p-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          <IconPlus width={15} height={15} />
          新建对话
        </button>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话…"
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 dark:border-zinc-800 dark:bg-zinc-950/60"
        />
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
            {sessions.length === 0 ? "还没有会话，\n点击上方按钮开始" : "没有匹配的会话"}
          </p>
        )}
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`group relative rounded-lg transition-colors ${
              s.id === activeId
                ? "bg-amber-500/10"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className="w-full px-3 py-2 text-left"
            >
              <p
                className={`truncate text-sm ${
                  s.id === activeId
                    ? "font-medium text-orange-700 dark:text-amber-300"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {s.title}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-600">
                <span className="truncate">{s.model}</span>
                <span>·</span>
                <span className="shrink-0">{timeAgo(s.updatedAt)}</span>
                {s.systemPrompt && (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:text-amber-400">
                    {roleNameById(findRoleByPrompt(s.systemPrompt))}
                  </span>
                )}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onDelete(s.id)}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
              title="删除会话"
            >
              <IconTrash width={14} height={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
