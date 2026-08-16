import type { NextRequest } from "next/server";

/**
 * OpenAI 兼容的流式对话代理：
 * 客户端把提供商配置（baseURL + apiKey）随请求发来，
 * 这里转发到对应的 /chat/completions 并把 SSE 流原样透传回浏览器。
 * API Key 不落盘、不进日志，仅在本机内存中转发。
 *
 * 特例：DeepSeek 的联网搜索只在 Anthropic 兼容端点暴露，
 * 此时代理改走 /anthropic/v1/messages，并把 Anthropic 流翻译回
 * OpenAI 格式后返回（客户端解析逻辑保持不变）。
 */

interface ChatRequestBody {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  messages?: { role: string; content: unknown }[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  search?: boolean;
  providerId?: string;
}

const ALLOWED_PROTOCOLS = ["https:", "http:"];
const RETRYABLE_STATUS = [400, 404, 415, 422];

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const DEEPSEEK_ANTHROPIC_BASE = "https://api.deepseek.com/anthropic";

/**
 * 各提供商的联网搜索参数（OpenAI 兼容接口写法）。
 * DeepSeek 不在此列——它走 Anthropic 兼容端点（见下）。
 */
function buildSearchParams(providerId: string | undefined): Record<string, unknown> | null {
  switch (providerId) {
    case "openai":
      return { tools: [{ type: "web_search" }] };
    case "qwen":
      return { enable_search: true };
    default:
      return null;
  }
}

function validate(body: ChatRequestBody): { ok: true } | { ok: false; message: string } {
  if (!body.baseURL || typeof body.baseURL !== "string") {
    return { ok: false, message: "缺少提供商 Base URL，请先在设置页配置。" };
  }
  let url: URL;
  try {
    url = new URL(body.baseURL);
  } catch {
    return { ok: false, message: "Base URL 格式不正确。" };
  }
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return { ok: false, message: "仅支持 http/https 协议的接口地址。" };
  }
  if (!body.apiKey) {
    return { ok: false, message: "尚未配置 API Key，请先在设置页填写。" };
  }
  if (!body.model) {
    return { ok: false, message: "请选择一个模型。" };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, message: "消息不能为空。" };
  }
  return { ok: true };
}

/** 从多模态内容中提取纯文本（Anthropic 路径暂不支持图片） */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type?: string; text?: string } =>
          !!b && typeof b === "object" && (b as { type?: string }).type === "text",
      )
      .map((b) => b.text ?? "")
      .join("\n");
  }
  return "";
}

function buildAnthropicBody(body: ChatRequestBody): string {
  return JSON.stringify({
    model: body.model,
    max_tokens: typeof body.maxTokens === "number" && body.maxTokens > 0 ? body.maxTokens : 8192,
    messages: (body.messages ?? []).map((m) => ({
      role: m.role === "system" || m.role === "assistant" ? m.role : "user",
      content: extractText(m.content),
    })),
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    tool_choice: { type: "auto" },
    thinking: { type: "disabled" },
    stream: true,
  });
}

function sseFrame(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

/**
 * 把 DeepSeek Anthropic 兼容流的 SSE 翻译成 OpenAI 格式：
 * text_delta → delta.content；web_search_tool_result → url_citation 引用；
 * message_delta → usage 统计；message_start 提供真实 model 名。
 */
export function translateAnthropicStream(
  upstream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let modelName = "";
  let inputTokens = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const event = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            let data = "";
            for (const line of event.split("\n")) {
              if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;
            try {
              const json = JSON.parse(data) as {
                type?: string;
                message?: { model?: string; usage?: { input_tokens?: number } };
                delta?: { type?: string; text?: string };
                content_block?: {
                  type?: string;
                  content?: Array<{
                    type?: string;
                    title?: string;
                    url?: string;
                    text?: string;
                  }>;
                };
                usage?: { output_tokens?: number };
              };
              const type = json.type;
              if (type === "message_start") {
                modelName = json.message?.model ?? modelName;
                inputTokens = json.message?.usage?.input_tokens ?? inputTokens;
                controller.enqueue(
                  sseFrame({ model: modelName || undefined, choices: [{ delta: {} }] }),
                );
              } else if (type === "content_block_start") {
                const block = json.content_block;
                if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
                  const citations = block.content
                    .filter((it) => it?.type === "web_search_result" && it?.url)
                    .map((it) => ({
                      type: "url_citation",
                      url_citation: { url: it.url, title: it.title },
                    }));
                  if (citations.length > 0) {
                    controller.enqueue(
                      sseFrame({
                        model: modelName || undefined,
                        choices: [{ delta: { annotations: citations } }],
                      }),
                    );
                  }
                }
              } else if (type === "content_block_delta") {
                const delta = json.delta;
                if (delta?.type === "text_delta" && typeof delta.text === "string") {
                  controller.enqueue(
                    sseFrame({
                      model: modelName || undefined,
                      choices: [{ delta: { content: delta.text } }],
                    }),
                  );
                }
              } else if (type === "message_delta") {
                controller.enqueue(
                  sseFrame({
                    usage: {
                      prompt_tokens: inputTokens,
                      completion_tokens: json.usage?.output_tokens ?? 0,
                    },
                  }),
                );
              } else if (type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
            } catch {
              // 忽略无法解析的事件
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          try {
            controller.close();
          } catch {
            // 已关闭
          }
          return;
        }
        controller.error(err);
      }
    },
    cancel() {
      void reader.cancel().catch(() => {});
    },
  });
}

/** DeepSeek 原生联网搜索（Anthropic 兼容端点） */
async function callAnthropicSearch(
  body: ChatRequestBody,
  signal: AbortSignal,
): Promise<Response | null> {
  try {
    const resp = await fetch(`${DEEPSEEK_ANTHROPIC_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": body.apiKey ?? "",
      },
      body: buildAnthropicBody(body),
      signal,
    });
    if (!resp.ok || !resp.body) return resp;
    const translated = translateAnthropicStream(resp.body);
    return new Response(translated, { status: 200, headers: SSE_HEADERS });
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: { message: "请求体不是有效的 JSON。" } }, { status: 400 });
  }

  const check = validate(body);
  if (!check.ok) {
    return Response.json({ error: { message: check.message } }, { status: 400 });
  }

  const baseURL = body.baseURL!.replace(/\/+$/, "");
  const endpoint = `${baseURL}/chat/completions`;

  const buildUpstreamBody = (includeUsage: boolean, includeSearch: boolean) => {
    const upstreamBody: Record<string, unknown> = {
      model: body.model,
      messages: body.messages!.map(({ role, content }) => ({ role, content })),
      stream: true,
    };
    if (includeUsage) upstreamBody.stream_options = { include_usage: true };
    if (includeSearch && body.search) {
      const searchParams = buildSearchParams(body.providerId);
      if (searchParams) Object.assign(upstreamBody, searchParams);
    }
    if (typeof body.temperature === "number" && Number.isFinite(body.temperature)) {
      upstreamBody.temperature = body.temperature;
    }
    if (typeof body.maxTokens === "number" && body.maxTokens > 0) {
      upstreamBody.max_tokens = Math.floor(body.maxTokens);
    }
    return JSON.stringify(upstreamBody);
  };

  const callUpstream = (includeUsage: boolean, includeSearch: boolean) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.apiKey}`,
      },
      body: buildUpstreamBody(includeUsage, includeSearch),
      signal: req.signal,
    });

  let upstream: Response | null = null;
  let searchDropped = false;

  // DeepSeek 联网搜索：走 Anthropic 兼容端点
  if (body.search && body.providerId === "deepseek") {
    upstream = await callAnthropicSearch(body, req.signal);
    if (!upstream || !upstream.ok) {
      searchDropped = true;
      upstream = null;
    }
  }

  // 普通 OpenAI 兼容路径（OpenAI/Qwen 的搜索参数在此注入）
  if (!upstream) {
    const searchSupported = body.search === true && body.providerId !== "deepseek";
    upstream = await callUpstream(true, searchSupported);
    if (!upstream.ok && RETRYABLE_STATUS.includes(upstream.status)) {
      upstream = await callUpstream(false, searchSupported);
      if (!upstream.ok && RETRYABLE_STATUS.includes(upstream.status) && searchSupported) {
        searchDropped = true;
        upstream = await callUpstream(false, false);
      }
    }
  }

  if (!upstream.ok || !upstream.body) {
    let message = `上游请求失败（HTTP ${upstream.status}）`;
    try {
      const raw = await upstream.text();
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // 保留默认错误信息
    }
    return Response.json({ error: { message, status: upstream.status } }, {
      status: upstream.status,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...SSE_HEADERS,
      // 客户端据此提示「联网搜索未生效」
      ...(searchDropped ? { "x-aidesk-search-dropped": "1" } : {}),
    },
  });
}
