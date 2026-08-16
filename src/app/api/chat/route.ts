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
  thinking?: boolean;
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

/** 各提供商的思考模式参数（OpenAI 兼容接口写法） */
function buildThinkingParams(
  providerId: string | undefined,
  enabled: boolean,
): Record<string, unknown> | null {
  switch (providerId) {
    case "deepseek":
      return { thinking: { type: enabled ? "enabled" : "disabled" } };
    case "qwen":
      return { enable_thinking: enabled };
    case "zhipu":
      return { thinking: { type: enabled ? "enabled" : "disabled" } };
    case "openai":
      // gpt-5 系列默认思考；关闭时用 reasoning_effort: none
      return enabled ? null : { reasoning_effort: "none" };
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

/** 注入当前时间，让模型准确回答时间类问题（无需搜索） */
function timeSystemMessage(): { role: string; content: string } {
  const now = new Date();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const content = `当前时间：${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（周${weekdays[now.getDay()]}）${now.toLocaleTimeString("zh-CN", { hour12: false })}（用户本地时区）。回答涉及“现在/今天/当前时间/星期几/日期”的问题时，请以这个时间为准，不要依赖网页内容。`;
  return { role: "system", content };
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

/**
 * 构建 Anthropic Messages API 请求体。
 * - Claude（providerId=anthropic）：system 用顶层字段、思考需 budget_tokens
 * - DeepSeek 兼容端点：system 放 messages 中（官方 MCP 用法）
 */
function buildAnthropicBody(body: ChatRequestBody): string {
  const isAnthropic = body.providerId === "anthropic";
  const systemParts: string[] = [timeSystemMessage().content];
  const messages: { role: string; content: string }[] = [];
  for (const m of body.messages ?? []) {
    const content = extractText(m.content);
    if (m.role === "system") {
      systemParts.push(content);
      continue;
    }
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content });
  }
  const systemText = systemParts.join("\n\n");

  const out: Record<string, unknown> = {
    model: body.model,
    max_tokens: typeof body.maxTokens === "number" && body.maxTokens > 0 ? body.maxTokens : 8192,
    stream: true,
  };

  if (isAnthropic) {
    out.system = systemText;
    // Claude 思考需要预算；关闭时用 disabled
    out.thinking =
      body.thinking === false
        ? { type: "disabled" }
        : { type: "enabled", budget_tokens: 8192 };
  } else {
    out.messages = [{ role: "system", content: systemText }, ...messages];
    out.thinking = { type: body.thinking === false ? "disabled" : "enabled" };
  }
  if (!isAnthropic) {
    // DeepSeek 搜索路径始终带搜索工具
    out.tools = [{ type: "web_search_20250305", name: "web_search" }];
    out.tool_choice = { type: "auto" };
  } else if (body.search) {
    // Claude 原生联网搜索（Anthropic 服务端工具）
    out.tools = [{ type: "web_search_20250305", name: "web_search" }];
    out.tool_choice = { type: "auto" };
  }
  // 消息列表最后统一赋值（DeepSeek 分支在上面已赋值）
  out.messages = isAnthropic ? messages : out.messages;
  return JSON.stringify(out);
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
                delta?: { type?: string; text?: string; thinking?: string };
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
                } else if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
                  controller.enqueue(
                    sseFrame({
                      model: modelName || undefined,
                      choices: [{ delta: { reasoning_content: delta.thinking } }],
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

/**
 * Anthropic Messages API 调用（Claude 与 DeepSeek 搜索共用），
 * 并把 Anthropic 流翻译成 OpenAI 格式。
 */
async function callAnthropicApi(
  body: ChatRequestBody,
  signal: AbortSignal,
): Promise<Response | null> {
  try {
    const isAnthropic = body.providerId === "anthropic";
    const base = isAnthropic
      ? (body.baseURL ?? DEEPSEEK_ANTHROPIC_BASE).replace(/\/+$/, "")
      : DEEPSEEK_ANTHROPIC_BASE;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": body.apiKey ?? "",
    };
    if (isAnthropic) headers["anthropic-version"] = "2023-06-01";
    const resp = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers,
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

/** 提取上游错误文本（OpenAI 与 Anthropic 两种格式） */
async function extractUpstreamError(resp: Response | null): Promise<string> {
  if (!resp) return "网络请求失败";
  try {
    const raw = await resp.text();
    const parsed = JSON.parse(raw) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message ?? parsed.message ?? raw.slice(0, 200);
  } catch {
    return `HTTP ${resp.status}`;
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

  const buildUpstreamBody = (
    includeUsage: boolean,
    includeSearch: boolean,
    includeThinking: boolean,
  ) => {
    const upstreamBody: Record<string, unknown> = {
      model: body.model,
      messages: [
        timeSystemMessage(),
        ...body.messages!.map(({ role, content }) => ({ role, content })),
      ],
      stream: true,
    };
    if (includeUsage) upstreamBody.stream_options = { include_usage: true };
    if (includeSearch && body.search) {
      const searchParams = buildSearchParams(body.providerId);
      if (searchParams) Object.assign(upstreamBody, searchParams);
    }
    if (includeThinking && body.thinking !== undefined) {
      const thinkingParams = buildThinkingParams(body.providerId, body.thinking);
      if (thinkingParams) Object.assign(upstreamBody, thinkingParams);
    }
    if (typeof body.temperature === "number" && Number.isFinite(body.temperature)) {
      upstreamBody.temperature = body.temperature;
    }
    if (typeof body.maxTokens === "number" && body.maxTokens > 0) {
      upstreamBody.max_tokens = Math.floor(body.maxTokens);
    }
    return JSON.stringify(upstreamBody);
  };

  const callUpstream = (includeUsage: boolean, includeSearch: boolean, includeThinking: boolean) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.apiKey}`,
      },
      body: buildUpstreamBody(includeUsage, includeSearch, includeThinking),
      signal: req.signal,
    });

  let upstream: Response | null = null;
  let searchDropped = false;
  let searchError = "";

  // Claude：一律走 Anthropic Messages API（无 OpenAI 兼容端点）
  if (body.providerId === "anthropic") {
    let resp = await callAnthropicApi(body, req.signal);
    // 思考预算参数不被接受时重试关闭思考
    if (!resp || (!resp.ok && RETRYABLE_STATUS.includes(resp.status) && body.thinking !== false)) {
      const retried = await callAnthropicApi({ ...body, thinking: false }, req.signal);
      if (retried?.ok) resp = retried;
    }
    if (!resp || !resp.ok || !resp.body) {
      const message = await extractUpstreamError(resp);
      return Response.json(
        { error: { message, status: resp?.status ?? 502 } },
        { status: resp?.status ?? 502 },
      );
    }
    upstream = resp;
  }

  // DeepSeek 联网搜索：走 Anthropic 兼容端点
  if (!upstream && body.search && body.providerId === "deepseek") {
    const resp = await callAnthropicApi(body, req.signal);
    if (!resp || !resp.ok) {
      searchDropped = true;
      searchError = await extractUpstreamError(resp);
      upstream = null;
    } else {
      upstream = resp;
    }
  }

  // 普通 OpenAI 兼容路径（OpenAI/Qwen 的搜索参数在此注入）
  if (!upstream) {
    const searchSupported = body.search === true && body.providerId !== "deepseek";
    upstream = await callUpstream(true, searchSupported, true);
    if (!upstream.ok && RETRYABLE_STATUS.includes(upstream.status)) {
      upstream = await callUpstream(false, searchSupported, true);
      if (!upstream.ok && RETRYABLE_STATUS.includes(upstream.status) && searchSupported) {
        searchDropped = true;
        upstream = await callUpstream(false, false, true);
      }
      // 思考参数不受支持时最后兜底：按提供商默认模式请求
      if (
        !upstream.ok &&
        RETRYABLE_STATUS.includes(upstream.status) &&
        body.thinking !== undefined
      ) {
        upstream = await callUpstream(false, false, false);
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
      // 客户端据此提示「联网搜索未生效」及具体原因
      ...(searchDropped
        ? {
            "x-aidesk-search-dropped": "1",
            ...(searchError ? { "x-aidesk-search-error": encodeURIComponent(searchError) } : {}),
          }
        : {}),
    },
  });
}
