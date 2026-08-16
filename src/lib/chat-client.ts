/**
 * 通过 /api/chat 代理发起 OpenAI 兼容的流式对话。
 * 解析上游 SSE，把增量文本回调给调用方。
 */

import type { Citation } from "./types";

/** OpenAI 兼容的多模态消息内容 */
export type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export interface ChatRequest {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: ChatContent }[];
  /** 采样温度（0-2），缺省用提供商默认 */
  temperature?: number;
  /** 最大输出 token 数（>0 时生效） */
  maxTokens?: number;
  /** 是否启用联网搜索（需提供商支持，不支持时自动降级） */
  search?: boolean;
  /** 提供商 id（用于注入对应搜索参数） */
  providerId?: string;
}

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
}

export interface StreamHandlers {
  /** content 为正文增量，reasoning 为推理过程增量（可能为空） */
  onDelta: (content: string, reasoning: string) => void;
  /** 上游返回 usage 统计时触发（通常出现在流末尾） */
  onUsage?: (usage: UsageStats) => void;
  /** 联网搜索引用来源更新时触发（携带累计列表） */
  onCitations?: (citations: Citation[]) => void;
  /** 上游流中声明的实际模型名（首个数据帧触发） */
  onModel?: (model: string) => void;
  /** 请求了联网搜索但被上游拒绝、已降级为普通回答时触发 */
  onSearchDropped?: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export async function streamChat(
  request: ChatRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      handlers.onDone();
      return;
    }
    handlers.onError("网络请求失败，请检查网络连接。");
    return;
  }

  if (!res.ok || !res.body) {
    let message = `请求失败（HTTP ${res.status}）`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      // 保留默认错误信息
    }
    handlers.onError(message);
    return;
  }

  // 联网搜索参数被上游拒绝时的提示
  if (res.headers.get("x-aidesk-search-dropped") === "1") {
    handlers.onSearchDropped?.();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const citations: Citation[] = [];
  const seenUrls = new Set<string>();
  let modelReported = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 事件以空行分隔
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              model?: string;
              choices?: {
                delta?: {
                  content?: string;
                  reasoning_content?: string;
                  annotations?: Array<{
                    type?: string;
                    url?: string;
                    title?: string;
                    url_citation?: { url?: string; title?: string };
                  }>;
                };
              }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            // 统计帧（DeepSeek / OpenAI 在流末尾返回）
            if (json.usage && typeof json.usage.prompt_tokens === "number") {
              handlers.onUsage?.({
                promptTokens: json.usage.prompt_tokens,
                completionTokens: json.usage.completion_tokens ?? 0,
              });
              continue;
            }
            // 上游声明的实际模型名
            if (!modelReported && typeof json.model === "string" && json.model) {
              modelReported = true;
              handlers.onModel?.(json.model);
            }
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;
            // 联网搜索引用（OpenAI url_citation 等）
            if (delta.annotations && delta.annotations.length > 0) {
              let changed = false;
              for (const ann of delta.annotations) {
                const url = ann.url_citation?.url ?? ann.url;
                if (typeof url !== "string" || !url || seenUrls.has(url)) continue;
                seenUrls.add(url);
                citations.push({ url, title: ann.url_citation?.title ?? ann.title });
                changed = true;
              }
              if (changed) handlers.onCitations?.(citations.map((c) => ({ ...c })));
            }
            handlers.onDelta(delta.content ?? "", delta.reasoning_content ?? "");
          } catch {
            // 忽略无法解析的帧
          }
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      handlers.onDone();
      return;
    }
    handlers.onError("读取流式响应时出错。");
    return;
  }

  handlers.onDone();
}
