import { useSyncExternalStore } from "react";
import { hydrate, persist } from "./remote-store";

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

const RESOURCE = "prompts";
const SERVER_SNAPSHOT: PromptTemplate[] = [];

let current: PromptTemplate[] | null = null;
let hydrating = false;
const listeners = new Set<() => void>();

/** 内置模板由服务端在数据库首次初始化时种入，这里只负责拉取 */
function startHydrate(): void {
  if (hydrating) return;
  hydrating = true;
  void hydrate<PromptTemplate>(RESOURCE).then((data) => {
    if (data === null) return;
    // 合并而非替换，理由同 sessions-store：读回来之前的本地新增不能丢
    const local = current ?? SERVER_SNAPSHOT;
    const localIds = new Set(local.map((p) => p.id));
    current = [...local, ...data.filter((p) => !localIds.has(p.id))];
    listeners.forEach((listener) => listener());
  });
}

function getSnapshot(): PromptTemplate[] {
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

/** 订阅提示词库（Postgres 持久化） */
export function usePrompts(): PromptTemplate[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function updatePrompts(updater: (prev: PromptTemplate[]) => PromptTemplate[]): void {
  const next = updater(getSnapshot());
  current = next;
  persist(RESOURCE, getSnapshot);
  listeners.forEach((listener) => listener());
}
