import { useSyncExternalStore } from "react";

/** 命令面板（Cmd+K）状态 */
interface CommandState {
  open: boolean;
  query: string;
}

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
  return useSyncExternalStore(subscribe, getSnapshot, () => ({ open: false, query: "" }));
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
