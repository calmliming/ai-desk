import { useSyncExternalStore } from "react";
import { defaultSettings } from "./providers";
import { loadSettings, saveSettings } from "./storage";
import type { AppSettings } from "./types";

/** 服务端快照：固定引用，避免无限循环 */
const SERVER_SNAPSHOT: AppSettings = defaultSettings();

let current: AppSettings | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): AppSettings {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (current === null) current = loadSettings();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 订阅应用设置（localStorage 持久化） */
export function useAppSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

/** 更新设置：写入内存、持久化到 localStorage 并通知订阅者 */
export function updateAppSettings(next: AppSettings): void {
  current = next;
  saveSettings(next);
  listeners.forEach((listener) => listener());
}
