import { useSyncExternalStore } from "react";
import { hydrate, persist } from "./remote-store";
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
  /** 是否启用联网搜索（需提供商支持） */
  search?: boolean;
  /** 思考模式：true=深度思考（默认），false=快速回答 */
  thinking?: boolean;
  createdAt: number;
  updatedAt: number;
}

const RESOURCE = "sessions";
const SERVER_SNAPSHOT: Session[] = [];

/** 已停用模型 → 现行替代模型（加载旧会话/对比槽位时自动迁移） */
export const RETIRED_MODELS: Record<string, string> = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
  "gpt-4o": "gpt-5",
  "gpt-4o-mini": "gpt-5.4-mini",
  "o3-mini": "gpt-5.4-mini",
  "gpt-4.1": "gpt-5",
  "moonshot-v1-8k": "kimi-k3",
  "moonshot-v1-32k": "kimi-k3",
  "moonshot-v1-128k": "kimi-k3",
  "kimi-k2.6": "kimi-k3",
  "qwen-turbo": "qwen-plus",
};

function migrateSession(s: Session): Session {
  const next = RETIRED_MODELS[s.model];
  return next ? { ...s, model: next } : s;
}

let current: Session[] | null = null;
let hydrating = false;
const listeners = new Set<() => void>();

/** 首次取快照时异步拉库；期间先用空数组，读回来后再通知重渲染 */
function startHydrate(): void {
  if (hydrating) return;
  hydrating = true;
  void hydrate<Session>(RESOURCE).then((data) => {
    if (data === null) return;
    // 合并而非替换：读回来之前用户可能已新建会话，两边都要保住。
    // 本地为空（绝大多数情况）时，结果就等于直接采用远端数据。
    const local = current ?? SERVER_SNAPSHOT;
    const localIds = new Set(local.map((s) => s.id));
    current = [...local, ...data.filter((s) => !localIds.has(s.id))].map(migrateSession);
    listeners.forEach((listener) => listener());
  });
}

function getSnapshot(): Session[] {
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

/** 订阅全部会话（Postgres 持久化） */
export function useSessions(): Session[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function updateSessions(
  updater: (prev: Session[]) => Session[],
  opts?: { persist?: boolean },
): Session[] {
  const next = updater(getSnapshot());
  current = next;
  // persist:false 用于流式输出途中的高频更新，只走内存，落库交给流结束后那一次
  if (opts?.persist !== false) persist(RESOURCE, getSnapshot);
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
