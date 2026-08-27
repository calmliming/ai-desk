import type { NextRequest } from "next/server";
import { McpSession, toOpenAiTools } from "@/lib/mcp";
import type { McpServerConfig } from "@/lib/types";

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
  /** 是否允许模型调用 MCP 工具 */
  tools?: boolean;
  /** 客户端配置的 MCP 服务器列表 */
  mcpServers?: McpServerConfig[];
}

const ALLOWED_PROTOCOLS = ["https:", "http:"];
const RETRYABLE_STATUS = [400, 404, 415, 422];
/** 瞬时错误：稍等后原样重试一次（上游高峰期 503/429 常见） */
const TRANSIENT_STATUS = [429, 500, 502, 503, 504];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** 注入当前时间与应用能力提示，让模型准确回答 */
function timeSystemMessage(): { role: string; content: string } {
  const now = new Date();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const content = `当前时间：${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（周${weekdays[now.getDay()]}）${now.toLocaleTimeString("zh-CN", { hour12: false })}（用户本地时区）。回答涉及“现在/今天/当前时间/星期几/日期”的问题时，请以这个时间为准，不要依赖网页内容。\n你运行在一个支持图片生成的工作台里：如果用户要求画图或生成图片，请直接告诉用户“点击输入框右侧的 🎨 按钮即可生成图片”，并顺手给出 1-2 条精炼的画面提示词建议，不要声称自己无法生成。`;
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

/** MCP 工具调用最多轮数，防止模型在工具间死循环 */
const MAX_TOOL_ROUNDS = 5;

/**
 * 带 MCP 工具的对话：非流式循环执行工具调用，
 * 通过 SSE 把「工具调用记录 → 最终回答」逐步推给客户端。
 */
async function handleMcpChat(
  body: ChatRequestBody,
  servers: McpServerConfig[],
  baseURL: string,
  signal: AbortSignal,
): Promise<Response> {
  const session = new McpSession();
  await session.connect(servers);
  if (session.tools.length === 0) {
    await session.close();
    return Response.json(
      { error: { message: "已启用的 MCP 服务器没有提供任何工具，请检查服务器配置与连通性。" } },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (obj: unknown) => controller.enqueue(sseFrame(obj));
      try {
        const messages: Array<Record<string, unknown>> = [
          timeSystemMessage(),
          ...body.messages!.map(({ role, content }) => ({ role, content })),
        ];
        const tools = toOpenAiTools(session.tools);
        let content = "";
        let modelUsed = "";
        let usage: { prompt: number; completion: number } | null = null;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const upstreamBody: Record<string, unknown> = {
            model: body.model,
            messages,
            tools,
            tool_choice: "auto",
          };
          if (typeof body.temperature === "number" && Number.isFinite(body.temperature)) {
            upstreamBody.temperature = body.temperature;
          }
          if (typeof body.maxTokens === "number" && body.maxTokens > 0) {
            upstreamBody.max_tokens = Math.floor(body.maxTokens);
          }
          if (body.thinking !== undefined) {
            const thinkingParams = buildThinkingParams(body.providerId, body.thinking);
            if (thinkingParams) Object.assign(upstreamBody, thinkingParams);
          }
          if (body.search && body.providerId !== "deepseek") {
            const searchParams = buildSearchParams(body.providerId);
            if (searchParams) Object.assign(upstreamBody, searchParams);
          }

          let resp = await fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${body.apiKey}`,
            },
            body: JSON.stringify(upstreamBody),
            signal,
          });

          // 瞬时错误：稍等后原样重试一次
          if (!resp.ok && TRANSIENT_STATUS.includes(resp.status)) {
            await sleep(900);
            const retried = await fetch(`${baseURL}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${body.apiKey}`,
              },
              body: JSON.stringify(upstreamBody),
              signal,
            });
            if (retried.ok) resp = retried;
          }

          if (!resp.ok) {
            enqueue({ error: { message: await extractUpstreamError(resp) } });
            controller.close();
            return;
          }

          const data = (await resp.json()) as {
            model?: string;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
            choices?: [
              {
                message?: {
                  content?: string | null;
                  tool_calls?: Array<{
                    id?: string;
                    type?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
              },
            ];
          };
          if (data.model) modelUsed = data.model;
          const msg = data.choices?.[0]?.message;
          if (!msg) {
            enqueue({ error: { message: "上游响应缺少消息内容。" } });
            controller.close();
            return;
          }
          const calls = msg.tool_calls ?? [];
          content = msg.content ?? "";

          if (calls.length === 0) {
            usage = data.usage
              ? {
                  prompt: data.usage.prompt_tokens ?? 0,
                  completion: data.usage.completion_tokens ?? 0,
                }
              : null;
            break;
          }

          // 执行工具并把结果回传模型
          messages.push({ role: "assistant", content: content || null, tool_calls: calls });
          for (const call of calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function?.arguments ?? "{}") as Record<string, unknown>;
            } catch {
              args = {};
            }
            const name = call.function?.name ?? "unknown";
            enqueue({ choices: [{ delta: { tool_calls: [{ name, args }] } }] });
            const resultText = await session.callTool(name, args);
            messages.push({ role: "tool", tool_call_id: call.id ?? "", content: resultText });
          }
        }

        if (!content) {
          enqueue({ error: { message: "工具调用已完成，但模型未给出最终回答。" } });
          controller.close();
          return;
        }
        if (modelUsed) enqueue({ model: modelUsed, choices: [{ delta: {} }] });
        enqueue({ choices: [{ delta: { content } }] });
        if (usage) {
          enqueue({
            usage: { prompt_tokens: usage.prompt, completion_tokens: usage.completion },
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          try {
            controller.close();
          } catch {
            // 已关闭
          }
          return;
        }
        enqueue({
          error: {
            message: `工具调用失败：${err instanceof Error ? err.message : String(err)}`,
          },
        });
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      } finally {
        await session.close();
      }
    },
    cancel() {
      void session.close();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
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

  // MCP 工具调用路径（Claude 走 Anthropic 格式，暂不经过这里）
  const mcpServers = McpSession.enabled(body.mcpServers);
  if (body.tools === true && body.providerId !== "anthropic" && mcpServers.length > 0) {
    return handleMcpChat(body, mcpServers, baseURL, req.signal);
  }

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
    // 瞬时错误（503/429 等）：稍等后原样重试一次
    if (!upstream.ok && TRANSIENT_STATUS.includes(upstream.status)) {
      await sleep(900);
      const retried = await callUpstream(true, searchSupported, true);
      if (retried.ok) upstream = retried;
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
