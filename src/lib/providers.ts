import type { AppSettings, ProviderConfig, ThemeMode } from "./types";

export const CUSTOM_PROVIDER_ID = "custom";

/** 内置提供商预设（均为 OpenAI 兼容 chat/completions 接口）· 2026-08 更新 */
export const PROVIDER_PRESETS: ProviderConfig[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    apiKey: "",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
    builtin: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    apiKey: "",
    models: ["gpt-5", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.5", "gpt-5.4-mini"],
    builtin: true,
  },
  {
    id: "moonshot",
    name: "Moonshot · Kimi",
    baseURL: "https://api.moonshot.cn/v1",
    apiKey: "",
    models: ["kimi-k2.6", "kimi-k2.7-code"],
    builtin: true,
  },
  {
    id: "qwen",
    name: "通义千问 · Qwen",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "",
    models: [
      "qwen-max",
      "qwen3.7-max",
      "qwen-plus",
      "qwen3.7-plus",
      "qwen-vl-max",
      "qwen-vl-plus",
    ],
    builtin: true,
  },
];

export const CUSTOM_PROVIDER: ProviderConfig = {
  id: CUSTOM_PROVIDER_ID,
  name: "自定义",
  baseURL: "https://api.example.com/v1",
  apiKey: "",
  models: [],
};

/** 已停用的旧预设模型列表（用于自动迁移已保存的设置） */
const OUTDATED_MODEL_LISTS: Record<string, string[][]> = {
  deepseek: [["deepseek-chat", "deepseek-reasoner"]],
  openai: [
    ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4.1"],
    ["gpt-5", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4-mini"],
  ],
  moonshot: [
    ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    ["kimi-k2.6"],
  ],
  qwen: [
    ["qwen-turbo", "qwen-plus", "qwen-max"],
    ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-vl-max", "qwen-vl-plus"],
  ],
};

/**
 * 若某提供商保存的模型列表仍是旧预设（用户未自定义），
 * 迁移为最新预设，保留 API Key 等用户配置。
 */
export function migrateProviderModels(provider: ProviderConfig): ProviderConfig {
  const outdatedLists = OUTDATED_MODEL_LISTS[provider.id];
  const preset = PROVIDER_PRESETS.find((p) => p.id === provider.id);
  if (!outdatedLists || !preset) return provider;
  const isOutdated = outdatedLists.some(
    (list) =>
      list.length === provider.models.length &&
      list.every((m, i) => provider.models[i] === m),
  );
  return isOutdated ? { ...provider, models: [...preset.models] } : provider;
}

/** 生成默认设置（apiKey 留空） */
export function defaultSettings(theme: ThemeMode = "dark"): AppSettings {
  const providers: Record<string, ProviderConfig> = {};
  for (const preset of PROVIDER_PRESETS) {
    providers[preset.id] = { ...preset, models: [...preset.models] };
  }
  providers[CUSTOM_PROVIDER_ID] = { ...CUSTOM_PROVIDER };
  return {
    version: 1,
    theme,
    activeProviderId: "deepseek",
    providers,
  };
}
