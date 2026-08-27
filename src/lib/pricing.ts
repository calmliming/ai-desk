/**
 * Token 定价与上下文窗口参考表。
 * 价格为公开价目估算（元 / 百万 tokens，USD 按 7.2 折算），随厂商调价可能变动；
 * 未登记的模型回退到「提供商默认价」，自定义提供商回退到全局兜底价。
 */

export interface ModelMeta {
  /** 输入价格（元 / 1M tokens） */
  input: number;
  /** 输出价格（元 / 1M tokens） */
  output: number;
  /** 上下文窗口上限（tokens，用于用量提醒） */
  context: number;
}

/** 精确到模型的价格表（模型名 → 单价与上下文窗口） */
export const MODEL_META: Record<string, ModelMeta> = {
  // DeepSeek（v4 系列按官方 v3 价目估算）
  "deepseek-v4-pro": { input: 4, output: 16, context: 131072 },
  "deepseek-v4-flash": { input: 2, output: 8, context: 131072 },
  "deepseek-v4-flash-vision-exp": { input: 2, output: 8, context: 131072 },
  // OpenAI（按 gpt-5 系列公开价估算）
  "gpt-5": { input: 9, output: 72, context: 400000 },
  "gpt-5.6-sol": { input: 14, output: 108, context: 400000 },
  "gpt-5.6-luna": { input: 4, output: 11, context: 400000 },
  "gpt-5.6-terra": { input: 4, output: 11, context: 400000 },
  "gpt-5.5": { input: 9, output: 72, context: 400000 },
  "gpt-5.4-mini": { input: 2, output: 7, context: 400000 },
  // Anthropic · Claude（公开价，$×7.2 折算）
  "claude-fable-5": { input: 22, output: 108, context: 200000 },
  "claude-fable-5-mythos-5": { input: 22, output: 108, context: 200000 },
  "claude-4-1-opus": { input: 108, output: 540, context: 200000 },
  "claude-4-1-opus-thinking": { input: 108, output: 540, context: 200000 },
  "claude-haiku-4-5": { input: 7, output: 36, context: 200000 },
  // Moonshot · Kimi
  "kimi-k3": { input: 4, output: 16, context: 131072 },
  "kimi-k2.7-code": { input: 4, output: 16, context: 131072 },
  // 通义千问
  "qwen3.8-max": { input: 2.4, output: 9.6, context: 262144 },
  "qwen3.7-max": { input: 2.4, output: 9.6, context: 262144 },
  "qwen3.7-plus": { input: 0.8, output: 2, context: 262144 },
  "qwen-max": { input: 2.4, output: 9.6, context: 32768 },
  "qwen-vl-max": { input: 3, output: 9, context: 32768 },
  "qwen-vl-plus": { input: 1.5, output: 4.5, context: 32768 },
  // Google · Gemini
  "gemini-3": { input: 14, output: 72, context: 1048576 },
  "gemini-3-flash": { input: 4, output: 18, context: 1048576 },
  "gemini-2.5-pro": { input: 9, output: 72, context: 1048576 },
  "gemini-2.5-flash": { input: 2, output: 11, context: 1048576 },
  // xAI · Grok
  "grok-5": { input: 22, output: 108, context: 262144 },
  "grok-4.1": { input: 22, output: 108, context: 262144 },
  "grok-4.1-mini": { input: 7, output: 36, context: 262144 },
  "grok-3-mini": { input: 2, output: 7, context: 262144 },
  // 智谱 · GLM
  "glm-5": { input: 4, output: 16, context: 131072 },
  "glm-4.7": { input: 4, output: 16, context: 131072 },
  "glm-4.7-flash": { input: 0.5, output: 2, context: 131072 },
  "glm-4.5-air": { input: 0.5, output: 2, context: 131072 },
  // MiniMax
  "minimax-m2.7": { input: 4, output: 16, context: 131072 },
  "minimax-m2.5": { input: 4, output: 16, context: 131072 },
};

/** 提供商级默认价（该提供商下有模型未登记时使用） */
export const PROVIDER_DEFAULT_META: Record<string, ModelMeta> = {
  deepseek: { input: 2, output: 8, context: 131072 },
  openai: { input: 9, output: 72, context: 400000 },
  anthropic: { input: 22, output: 108, context: 200000 },
  moonshot: { input: 4, output: 16, context: 131072 },
  qwen: { input: 2.4, output: 9.6, context: 262144 },
  gemini: { input: 4, output: 18, context: 1048576 },
  grok: { input: 22, output: 108, context: 262144 },
  zhipu: { input: 4, output: 16, context: 131072 },
  minimax: { input: 4, output: 16, context: 131072 },
};

/** 全局兜底（自定义提供商 / 未知模型） */
export const FALLBACK_META: ModelMeta = { input: 2, output: 8, context: 131072 };

/** 取某个提供商 + 模型的价格与上下文窗口 */
export function metaFor(providerId: string, model: string): ModelMeta {
  return MODEL_META[model] ?? PROVIDER_DEFAULT_META[providerId] ?? FALLBACK_META;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/** 单次用量费用（元） */
export function costOf(providerId: string, model: string, usage: TokenUsage): number {
  const meta = metaFor(providerId, model);
  return (
    (usage.promptTokens / 1_000_000) * meta.input +
    (usage.completionTokens / 1_000_000) * meta.output
  );
}

/** 金额显示：≥1 元保留 2 位，小金额保留 3~4 位 */
export function formatCost(cost: number): string {
  if (cost >= 1) return `¥${cost.toFixed(2)}`;
  if (cost >= 0.01) return `¥${cost.toFixed(3)}`;
  return `¥${cost.toFixed(4)}`;
}

/** token 数量显示 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
