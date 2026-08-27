export type ThemeMode = "dark" | "light";

/** 一个模型提供商（OpenAI 兼容接口）的配置 */
export interface ProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  models: string[];
  /** 生图模型（走 OpenAI 兼容 /images/generations 接口；留空 = 不支持生图） */
  imageModel?: string;
  /** 内置预设提供商：名称不可修改 */
  builtin?: boolean;
}

/** 一个 MCP 服务器（stdio = 本地命令，http = 远程 Streamable HTTP） */
export interface McpServerConfig {
  id: string;
  name: string;
  type: "stdio" | "http";
  /** type=stdio：启动命令（如 npx） */
  command?: string;
  /** type=stdio：命令参数（如 -y @modelcontextprotocol/server-filesystem） */
  args?: string[];
  /** type=http：服务器地址 */
  url?: string;
  enabled: boolean;
}

export interface AppSettings {
  version: 1;
  theme: ThemeMode;
  /** 当前使用的提供商 id */
  activeProviderId: string;
  providers: Record<string, ProviderConfig>;
  /** MCP 服务器列表（对话中启用工具时可被模型调用） */
  mcpServers: McpServerConfig[];
  /** 回答完成时发送桌面通知（仅页面处于后台时提醒） */
  notifyOnDone: boolean;
}

/** 联网搜索返回的引用来源 */
export interface Citation {
  url: string;
  title?: string;
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
  /** 联网搜索的引用来源（OpenAI web_search 返回） */
  citations?: Citation[];
  /** 上游实际响应的模型名（用于核对真实模型） */
  modelUsed?: string;
  /** 回答过程中调用的 MCP 工具（展示用） */
  toolCalls?: { name: string; args: Record<string, unknown> }[];
  createdAt: number;
}
