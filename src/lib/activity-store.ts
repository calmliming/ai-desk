import { useSyncExternalStore } from "react";

/** 操作类型 */
export type ActivityType =
  | "chat"
  | "tool"
  | "compare"
  | "prompt"
  | "settings"
  | "file"
  | "session"
  | "project";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  detail?: string;
  time: number;
}

/** 各类型的展示元信息 */
export const ACTIVITY_META: Record<ActivityType, { label: string; emoji: string }> = {
  chat: { label: "对话", emoji: "💬" },
  tool: { label: "工具", emoji: "🛠️" },
  compare: { label: "对比", emoji: "⚖️" },
  prompt: { label: "提示词", emoji: "📌" },
  settings: { label: "设置", emoji: "⚙️" },
  file: { label: "文件", emoji: "📎" },
  session: { label: "会话", emoji: "🗂️" },
  project: { label: "项目", emoji: "📁" },
};

const ACTIVITY_KEY = "aidesk.activity.v1";
/** 最多保留的条数（防 localStorage 膨胀） */
const MAX_ENTRIES = 300;
const SERVER_SNAPSHOT: ActivityEntry[] = [];

let current: ActivityEntry[] | null = null;
const listeners = new Set<() => void>();

function uid(): string {
  return crypto.randomUUID();
}

function load(): ActivityEntry[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}

function getSnapshot(): ActivityEntry[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (current === null) current = load();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persist(entries: ActivityEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(entries));
  } catch {
    // 忽略存储失败
  }
}

/** 订阅操作记录 */
export function useActivity(): ActivityEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

/** 记录一条操作（新记录在前） */
export function logActivity(type: ActivityType, title: string, detail?: string): void {
  const entry: ActivityEntry = {
    id: uid(),
    type,
    title,
    detail: detail && detail.length > 120 ? `${detail.slice(0, 120)}…` : detail,
    time: Date.now(),
  };
  const next = [entry, ...getSnapshot()].slice(0, MAX_ENTRIES);
  current = next;
  persist(next);
  listeners.forEach((listener) => listener());
}

/** 清空全部记录 */
export function clearActivity(): void {
  current = [];
  persist([]);
  listeners.forEach((listener) => listener());
}
