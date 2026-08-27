import type { NextRequest } from "next/server";

/**
 * OpenAI 兼容的图片生成代理：
 * 客户端把提供商配置（baseURL + apiKey）随请求发来，
 * 这里转发到对应的 /images/generations，把 b64 结果转成 data URL 返回。
 */

interface ImageRequestBody {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  prompt?: string;
  size?: string;
}

const ALLOWED_PROTOCOLS = ["https:", "http:"];
const ALLOWED_SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"];
/** 瞬时错误：稍等后原样重试一次 */
const TRANSIENT_STATUS = [429, 500, 502, 503, 504];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  let body: ImageRequestBody;
  try {
    body = (await req.json()) as ImageRequestBody;
  } catch {
    return Response.json({ error: { message: "请求体不是有效的 JSON。" } }, { status: 400 });
  }

  if (!body.baseURL || typeof body.baseURL !== "string") {
    return Response.json({ error: { message: "缺少提供商 Base URL。" } }, { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(body.baseURL);
  } catch {
    return Response.json({ error: { message: "Base URL 格式不正确。" } }, { status: 400 });
  }
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return Response.json({ error: { message: "仅支持 http/https 协议的接口地址。" } }, { status: 400 });
  }
  if (!body.apiKey) {
    return Response.json({ error: { message: "尚未配置 API Key，请先在设置页填写。" } }, { status: 400 });
  }
  if (!body.model) {
    return Response.json({ error: { message: "当前提供商未配置生图模型，请到设置页添加（如 gpt-image-2）。" } }, { status: 400 });
  }
  if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return Response.json({ error: { message: "请描述想生成的画面。" } }, { status: 400 });
  }
  const size = body.size && ALLOWED_SIZES.includes(body.size) ? body.size : "1024x1024";

  const base = body.baseURL.replace(/\/+$/, "");
  const endpoint = `${base}/images/generations`;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.apiKey}`,
      },
      body: JSON.stringify({
        model: body.model,
        prompt: body.prompt,
        n: 1,
        size,
        response_format: "b64_json",
      }),
      signal: req.signal,
    });
    // 瞬时错误：稍等后原样重试一次
    if (!upstream.ok && TRANSIENT_STATUS.includes(upstream.status)) {
      await sleep(900);
      const retried = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${body.apiKey}`,
        },
        body: JSON.stringify({
          model: body.model,
          prompt: body.prompt,
          n: 1,
          size,
          response_format: "b64_json",
        }),
        signal: req.signal,
      });
      if (retried.ok) upstream = retried;
    }
  } catch {
    return Response.json({ error: { message: "网络请求失败，请检查提供商地址。" } }, { status: 502 });
  }

  if (!upstream.ok) {
    let message = `上游请求失败（HTTP ${upstream.status}）`;
    try {
      const raw = await upstream.text();
      const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
      if (parsed.error?.message) message = parsed.error.message;
      else if (parsed.message) message = parsed.message;
    } catch {
      // 保留默认错误信息
    }
    return Response.json({ error: { message, status: upstream.status } }, { status: upstream.status });
  }

  try {
    const data = (await upstream.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const item = data.data?.[0];
    if (!item) {
      return Response.json({ error: { message: "上游未返回图片数据。" } }, { status: 502 });
    }
    const dataUrl = item.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : item.url;
    if (!dataUrl) {
      return Response.json({ error: { message: "上游未返回图片数据。" } }, { status: 502 });
    }
    return Response.json({ images: [dataUrl] });
  } catch {
    return Response.json({ error: { message: "解析上游响应失败。" } }, { status: 502 });
  }
}
