"use client";

import { useMemo, useState } from "react";
import { findRoleByPrompt, roleNameById } from "@/lib/roles";
import { updateSessions, type Session } from "@/lib/sessions-store";
import Select from "../ui/select";
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
  /** "all" | "fav" | "ungrouped" | "g:<分组名>" */
  const [filter, setFilter] = useState("all");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");

  const groups = useMemo(
    () =>
      Array.from(
        new Set(sessions.map((s) => s.group).filter((g): g is string => !!g)),
      ).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [sessions],
  );
  // 分组被删空后回退到「全部」
  const activeFilter =
    filter.startsWith("g:") && !groups.includes(filter.slice(2)) ? "all" : filter;

  const patch = (id: string, p: Partial<Session>) =>
    updateSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const matchesFilter = (s: Session) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "fav") return !!s.favorite;
    if (activeFilter === "ungrouped") return !s.group;
    return s.group === activeFilter.slice(2);
  };

  const filtered = sessions
    .filter(
      (s) =>
        matchesFilter(s) &&
        (!query.trim() ||
          s.title.toLowerCase().includes(query.toLowerCase()) ||
          s.messages.some((m) => m.content.toLowerCase().includes(query.toLowerCase()))),
    )
    // 稳定排序：置顶在前，组内保持原有顺序
    .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));

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
        <Select
          value={activeFilter}
          onChange={(e) => setFilter(e.target.value)}
          title="筛选会话"
          className="w-full"
        >
          <option value="all">全部会话</option>
          <option value="fav">⭐ 收藏</option>
          <option value="ungrouped">未分组</option>
          {groups.map((g) => (
            <option key={g} value={`g:${g}`}>
              {g}
            </option>
          ))}
        </Select>
      </div>
      <div className="relative flex-1 space-y-1 overflow-y-auto p-2">
        {menuId && (
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuId(null)}
            aria-hidden
          />
        )}
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
              className="w-full px-3 py-2 pr-20 text-left"
            >
              <p
                className={`truncate text-sm ${
                  s.id === activeId
                    ? "font-medium text-orange-700 dark:text-amber-300"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {s.pinned && <span className="mr-1">📌</span>}
                {s.favorite && <span className="mr-1">⭐</span>}
                {s.title}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-600">
                <span className="truncate">{s.model}</span>
                <span>·</span>
                <span className="shrink-0">{timeAgo(s.updatedAt)}</span>
                {s.group && (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    {s.group}
                  </span>
                )}
                {s.systemPrompt && (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:text-amber-400">
                    {roleNameById(findRoleByPrompt(s.systemPrompt))}
                  </span>
                )}
              </p>
            </button>

            <div className="absolute right-1.5 top-1.5 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <ActionIcon
                title={s.pinned ? "取消置顶" : "置顶"}
                onClick={() => patch(s.id, { pinned: !s.pinned })}
                active={!!s.pinned}
              >
                📌
              </ActionIcon>
              <ActionIcon
                title={s.favorite ? "取消收藏" : "收藏"}
                onClick={() => patch(s.id, { favorite: !s.favorite })}
                active={!!s.favorite}
              >
                ⭐
              </ActionIcon>
              <ActionIcon
                title="移动到分组"
                onClick={() => setMenuId(menuId === s.id ? null : s.id)}
              >
                🏷
              </ActionIcon>
              <ActionIcon
                title="删除会话"
                onClick={() => onDelete(s.id)}
                danger
              >
                <IconTrash width={13} height={13} />
              </ActionIcon>
            </div>

            {menuId === s.id && (
              <div className="absolute right-1 top-full z-20 mt-1 w-44 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <p className="px-2 py-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  移动到分组
                </p>
                <button
                  type="button"
                  onClick={() => {
                    patch(s.id, { group: "" });
                    setMenuId(null);
                  }}
                  className={`flex w-full items-center rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    !s.group
                      ? "bg-amber-500/10 font-medium text-orange-600 dark:text-amber-400"
                      : "text-zinc-600 dark:text-zinc-300"
                  }`}
                >
                  未分组
                </button>
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      patch(s.id, { group: g });
                      setMenuId(null);
                    }}
                    className={`flex w-full items-center rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                      s.group === g
                        ? "bg-amber-500/10 font-medium text-orange-600 dark:text-amber-400"
                        : "text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    {g}
                  </button>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = newGroup.trim();
                    if (!name) return;
                    patch(s.id, { group: name });
                    setNewGroup("");
                    setMenuId(null);
                  }}
                  className="mt-1 flex gap-1 border-t border-zinc-100 pt-1.5 dark:border-zinc-800"
                >
                  <input
                    type="text"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    placeholder="新建分组…"
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950/60"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-orange-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-500"
                  >
                    确定
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionIcon({
  title,
  onClick,
  active,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-6 w-6 items-center justify-center rounded-md text-[12px] transition-colors ${
        active
          ? "text-amber-500"
          : danger
            ? "text-zinc-400 hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-500"
            : "text-zinc-400 hover:bg-zinc-200 hover:text-amber-500 dark:text-zinc-500 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
