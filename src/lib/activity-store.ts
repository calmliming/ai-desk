import { useSyncExternalStore } from "react";
import { hydrate, persist } from "./remote-store";

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

const RESOURCE = "activity";
/**
 * 最多保留的条数。原来是 300，受限于 localStorage 容量；
 * 进库后放宽到 2000——但仍需上限：持久化是整份集合 PUT，
 * 条数无限增长会让每次记录都重传全表。
 */
const MAX_ENTRIES = 2000;
const SERVER_SNAPSHOT: ActivityEntry[] = [];

let current: ActivityEntry[] | null = null;
let hydrating = false;
const listeners = new Set<() => void>();

function uid(): string {
  return crypto.randomUUID();
}

function startHydrate(): void {
  if (hydrating) return;
  hydrating = true;
  void hydrate<ActivityEntry>(RESOURCE).then((data) => {
    if (data === null) return;
    // 合并而非替换，理由同 sessions-store：读回来之前的本地新增不能丢
    const local = current ?? SERVER_SNAPSHOT;
    const localIds = new Set(local.map((a) => a.id));
    current = [...local, ...data.filter((a) => !localIds.has(a.id))].slice(0, MAX_ENTRIES);
    listeners.forEach((listener) => listener());
  });
}

function getSnapshot(): ActivityEntry[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (current === null) {
    current = SERVER_SNAPSHOT;
    startHydrate();
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
  persist(RESOURCE, getSnapshot);
  listeners.forEach((listener) => listener());
}

/** 清空全部记录 */
export function clearActivity(): void {
  current = [];
  persist(RESOURCE, getSnapshot);
  listeners.forEach((listener) => listener());
}
