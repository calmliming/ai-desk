import { useSyncExternalStore } from "react";

/** 命令面板（Cmd+K）状态 */
interface CommandState {
  open: boolean;
  query: string;
}

/** 服务端快照：固定引用，避免 getServerSnapshot 无限循环警告 */
const SERVER_SNAPSHOT: CommandState = { open: false, query: "" };

let state: CommandState = { open: false, query: "" };
const listeners = new Set<() => void>();

function getSnapshot(): CommandState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  listeners.forEach((l) => l());
}

export function useCommandState(): CommandState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function openCommandPalette(): void {
  state = { open: true, query: "" };
  emit();
}

export function closeCommandPalette(): void {
  state = { ...state, open: false };
  emit();
}

export function setCommandQuery(query: string): void {
  state = { ...state, query };
  emit();
}
