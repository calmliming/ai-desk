import { useSyncExternalStore } from "react";

/** 轻提示（Toast）：操作反馈，自动消失 */

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const DURATION = 2600;
const SERVER_SNAPSHOT: ToastItem[] = [];

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function getSnapshot(): ToastItem[] {
  return toasts;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

function push(type: ToastType, message: string): void {
  const id = nextId++;
  toasts = [...toasts, { id, type, message }];
  listeners.forEach((l) => l());
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    listeners.forEach((l) => l());
  }, DURATION);
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  listeners.forEach((l) => l());
}
