import { defaultSettings, migrateProviderModels } from "./providers";
import type { AppSettings, ThemeMode } from "./types";

const SETTINGS_KEY = "aidesk.settings.v1";
const THEME_KEY = "aidesk.theme";

/** 读取设置；与默认值合并以保证向前兼容，并迁移过时的预设模型列表 */
export function loadSettings(): AppSettings {
  const defaults = defaultSettings();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const providers: AppSettings["providers"] = {
      ...defaults.providers,
      ...(parsed.providers ?? {}),
    };
    for (const [id, provider] of Object.entries(providers)) {
      providers[id] = migrateProviderModels(provider);
    }
    return { ...defaults, ...parsed, providers };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function saveTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
}
