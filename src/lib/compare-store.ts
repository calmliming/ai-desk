import { useSyncExternalStore } from "react";
import { hydrate, persist } from "./remote-store";
import { RETIRED_MODELS } from "./sessions-store";

/** 参与对比的一个模型槽位 */
export interface CompareSlot {
  providerId: string;
  model: string;
}

export const MAX_COMPARE_SLOTS = 6;

const RESOURCE = "compare";
const SERVER_SNAPSHOT: CompareSlot[] = [];

let current: CompareSlot[] | null = null;
let hydrating = false;
const listeners = new Set<() => void>();

function startHydrate(): void {
  if (hydrating) return;
  hydrating = true;
  void hydrate<CompareSlot>(RESOURCE).then((data) => {
    if (data === null || current !== SERVER_SNAPSHOT) return;
    current = data
      .filter((s) => typeof s.providerId === "string" && typeof s.model === "string")
      .map((s) => (RETIRED_MODELS[s.model] ? { ...s, model: RETIRED_MODELS[s.model] } : s));
    listeners.forEach((listener) => listener());
  });
}

function getSnapshot(): CompareSlot[] {
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

/** 订阅对比槽位（Postgres 持久化） */
export function useCompareSlots(): CompareSlot[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function updateCompareSlots(updater: (prev: CompareSlot[]) => CompareSlot[]): void {
  const next = updater(getSnapshot());
  current = next;
  persist(RESOURCE, getSnapshot);
  listeners.forEach((listener) => listener());
}

/** 槽位唯一键 */
export function slotKey(slot: CompareSlot): string {
  return `${slot.providerId}::${slot.model}`;
}
