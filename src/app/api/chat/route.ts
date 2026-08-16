import type { NextRequest } from "next/server";

/**
 * OpenAI 兼容的流式对话代理：
 * 客户端把提供商配置（baseURL + apiKey）随请求发来，
 * 这里转发到对应的 /chat/completions 并把 SSE 流原样透传回浏览器。
 * API Key 不落盘、不进日志，仅在本机内存中转发。
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

/**
 * 各提供商的联网搜索参数（均为官方原生搜索，无需额外 API Key）。
 * 返回 null 表示该提供商没有已知的搜索参数写法。
 */
function buildSearchParams(providerId: string | undefined): Record<string, unknown> | null {
  switch (providerId) {
    case "openai":
      return { tools: [{ type: "web_search" }] };
    case "deepseek":
      return {
        tools: [{ type: "builtin", function: { name: "web_search_20250305" } }],
      };
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
    // 请求 usage 统计（部分提供商不支持该参数，失败时回退重试）
    if (includeUsage) upstreamBody.stream_options = { include_usage: true };
    // 联网搜索参数（按提供商注入；不支持时降级为普通请求）
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
      // 浏览器断开时中止上游请求
      signal: req.signal,
    });

  let upstream = await callUpstream(true, true);
  // 400/404/422/415 可能是 stream_options 不受支持：去掉后重试
  if (!upstream.ok && RETRYABLE_STATUS.includes(upstream.status)) {
    upstream = await callUpstream(false, true);
    // 仍失败可能是搜索参数不受支持：再降级为普通请求
    if (!upstream.ok && RETRYABLE_STATUS.includes(upstream.status)) {
      upstream = await callUpstream(false, false);
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

  // 透传 SSE 流
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
