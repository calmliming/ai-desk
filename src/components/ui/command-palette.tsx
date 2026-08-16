"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  closeCommandPalette,
  setCommandQuery,
  useCommandState,
} from "@/lib/command-store";
import { toggleTheme } from "@/lib/theme";
import {
  IconChat,
  IconCompare,
  IconFolder,
  IconHistory,
  IconHome,
  IconMoon,
  IconPrompts,
  IconSettings,
  IconSun,
  IconTools,
} from "../icons";

interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
}

/** 全局命令面板（Cmd/Ctrl+K 呼出） */
export default function CommandPalette({ dark }: { dark: boolean }) {
  const router = useRouter();
  const { open, query } = useCommandState();
  const [active, setActive] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 打开时重置选中（渲染期同步调整）
  if (open && !wasOpen) {
    setWasOpen(true);
    setActive(0);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const actions = useMemo<CommandAction[]>(() => {
    const nav = (
      href: string,
      label: string,
      icon?: React.ReactNode,
    ): CommandAction => ({
      id: `nav-${href}`,
      label,
      icon,
      run: () => {
        closeCommandPalette();
        router.push(href);
      },
    });
    return [
      nav("/", "首页", <IconHome width={16} height={16} />),
      nav("/chat", "AI 对话", <IconChat width={16} height={16} />),
      nav("/compare", "模型对比", <IconCompare width={16} height={16} />),
      nav("/tools", "文本工具", <IconTools width={16} height={16} />),
      nav("/prompts", "提示词库", <IconPrompts width={16} height={16} />),
      nav("/projects", "项目管理", <IconFolder width={16} height={16} />),
      nav("/settings", "设置", <IconSettings width={16} height={16} />),
      nav("/activity", "操作记录", <IconHistory width={16} height={16} />),
      {
        id: "theme",
        label: dark ? "切换到浅色模式" : "切换到深色模式",
        icon: dark ? <IconSun width={16} height={16} /> : <IconMoon width={16} height={16} />,
        run: () => {
          closeCommandPalette();
          toggleTheme();
        },
      },
    ];
  }, [router, dark]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // 选中项滚动进视野
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const safeActive = Math.min(active, Math.max(filtered.length - 1, 0));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const action = filtered[safeActive];
      if (action) action.run();
    } else if (e.key === "Escape") {
      closeCommandPalette();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 px-4 pt-[16vh] backdrop-blur-sm"
      onClick={closeCommandPalette}
    >
      <div
        className="dialog-enter w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <span className="text-sm text-zinc-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setCommandQuery(e.target.value)}
            placeholder="搜索页面或输入命令…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          <kbd className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700">
            Esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-zinc-400">没有匹配的命令</p>
          )}
          {filtered.map((action, i) => (
            <button
              key={action.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => action.run()}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                i === safeActive
                  ? "bg-amber-500/10 text-orange-700 dark:bg-amber-400/10 dark:text-amber-300"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {action.icon && <span className="text-zinc-400">{action.icon}</span>}
              <span className="flex-1">{action.label}</span>
              {i === safeActive && <kbd className="text-[10px] text-zinc-400">↵</kbd>}
            </button>
          ))}
        </div>
        <p className="border-t border-zinc-100 px-4 py-2 text-[10px] text-zinc-400 dark:border-zinc-800">
          ↑↓ 选择 · Enter 执行 · Esc 关闭
        </p>
      </div>
    </div>
  );
}
