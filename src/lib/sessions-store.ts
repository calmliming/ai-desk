import { useSyncExternalStore } from "react";
import type { ChatMessage } from "./types";

export interface Session {
  id: string;
  title: string;
  providerId: string;
  model: string;
  messages: ChatMessage[];
  /** 系统提示词（角色预设） */
  systemPrompt?: string;
  /** 采样温度（未设置时使用提供商默认值） */
  temperature?: number;
  /** 最大输出 token 数（0/未设置 = 不限） */
  maxTokens?: number;
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = "aidesk.sessions.v1";
const SERVER_SNAPSHOT: Session[] = [];

let current: Session[] | null = null;
const listeners = new Set<() => void>();

function load(): Session[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    return [];
  }
}

function getSnapshot(): Session[] {
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

/** 订阅全部会话（localStorage 持久化） */
export function useSessions(): Session[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function updateSessions(
  updater: (prev: Session[]) => Session[],
  opts?: { persist?: boolean },
): Session[] {
  const next = updater(getSnapshot());
  current = next;
  if (opts?.persist !== false && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
    } catch {
      // 存储失败（如超限）时保持内存态
    }
  }
  listeners.forEach((listener) => listener());
  return next;
}

export function createSession(providerId: string, model: string): Session {
  const now = Date.now();
  const session: Session = {
    id: crypto.randomUUID(),
    title: "新对话",
    providerId,
    model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  updateSessions((prev) => [session, ...prev]);
  return session;
}

export function deleteSession(id: string): void {
  updateSessions((prev) => prev.filter((s) => s.id !== id));
}
