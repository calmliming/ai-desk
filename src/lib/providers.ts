import type { AppSettings, ProviderConfig, ThemeMode } from "./types";

export const CUSTOM_PROVIDER_ID = "custom";

/** 内置提供商预设（均为 OpenAI 兼容 chat/completions 接口） */
export const PROVIDER_PRESETS: ProviderConfig[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    apiKey: "",
    models: ["deepseek-chat", "deepseek-reasoner"],
    builtin: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    apiKey: "",
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4.1"],
    builtin: true,
  },
  {
    id: "moonshot",
    name: "Moonshot · Kimi",
    baseURL: "https://api.moonshot.cn/v1",
    apiKey: "",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    builtin: true,
  },
  {
    id: "qwen",
    name: "通义千问 · Qwen",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "",
    models: ["qwen-turbo", "qwen-plus", "qwen-max"],
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
