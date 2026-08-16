/**
 * 通过 /api/chat 代理发起 OpenAI 兼容的流式对话。
 * 解析上游 SSE，把增量文本回调给调用方。
 */

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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
              choices?: { delta?: { content?: string; reasoning_content?: string } }[];
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
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;
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
