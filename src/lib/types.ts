export type ThemeMode = "dark" | "light";

/** 一个模型提供商（OpenAI 兼容接口）的配置 */
export interface ProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  models: string[];
  /** 内置预设提供商：名称不可修改 */
  builtin?: boolean;
}

export interface AppSettings {
  version: 1;
  theme: ThemeMode;
  /** 当前使用的提供商 id */
  activeProviderId: string;
  providers: Record<string, ProviderConfig>;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  /** 推理过程（如 DeepSeek-R1 / reasoner 的 reasoning_content） */
  reasoning?: string;
  /** 图片附件 data URL（视觉模型消息用） */
  images?: string[];
  /** Token 用量（上游返回 usage 时填充） */
  usage?: { promptTokens: number; completionTokens: number };
  createdAt: number;
}
