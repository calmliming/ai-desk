import { useSyncExternalStore } from "react";

/** 侧边栏收起状态（localStorage 持久化） */
const KEY = "aidesk.sidebar.collapsed";

let collapsed: boolean | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (collapsed === null) {
    try {
      collapsed = window.localStorage.getItem(KEY) === "1";
    } catch {
      collapsed = false;
    }
  }
  return collapsed;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function toggleSidebar(): void {
  collapsed = !getSnapshot();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, collapsed ? "1" : "0");
    } catch {
      // 忽略存储失败
    }
  }
  listeners.forEach((listener) => listener());
}
