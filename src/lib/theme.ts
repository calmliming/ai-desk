import { useSyncExternalStore } from "react";
import { saveTheme } from "./storage";

const THEME_EVENT = "aidesk:themechange";

/** DOM 上的 .dark class 是主题的唯一事实来源（由 layout 的内联脚本在绘制前设置） */
function isDark(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("dark");
}

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

/** 订阅当前是否为深色模式 */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => true);
}

/** 切换主题并通知订阅者 */
export function toggleTheme() {
  const next = !isDark();
  document.documentElement.classList.toggle("dark", next);
  saveTheme(next ? "dark" : "light");
  window.dispatchEvent(new Event(THEME_EVENT));
}
