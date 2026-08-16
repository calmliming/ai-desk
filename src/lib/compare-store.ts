import { useSyncExternalStore } from "react";

/** 参与对比的一个模型槽位 */
export interface CompareSlot {
  providerId: string;
  model: string;
}

export const MAX_COMPARE_SLOTS = 6;

const SLOTS_KEY = "aidesk.compare.v1";
const SERVER_SNAPSHOT: CompareSlot[] = [];

let current: CompareSlot[] | null = null;
const listeners = new Set<() => void>();

function load(): CompareSlot[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as CompareSlot[]).filter(
      (s) => typeof s.providerId === "string" && typeof s.model === "string",
    );
  } catch {
    return [];
  }
}

function getSnapshot(): CompareSlot[] {
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

/** 订阅对比槽位（localStorage 持久化） */
export function useCompareSlots(): CompareSlot[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function updateCompareSlots(updater: (prev: CompareSlot[]) => CompareSlot[]): void {
  const next = updater(getSnapshot());
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SLOTS_KEY, JSON.stringify(next));
    } catch {
      // 忽略存储失败
    }
  }
  listeners.forEach((listener) => listener());
}

/** 槽位唯一键 */
export function slotKey(slot: CompareSlot): string {
  return `${slot.providerId}::${slot.model}`;
}
