"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { logActivity } from "@/lib/activity-store";
import { generateImage, streamChat, type ChatContent, type UsageStats } from "@/lib/chat-client";
import type { FileAttachment } from "@/lib/file-reader";
import { notifyComplete } from "@/lib/notifications";
import { formatTokens, metaFor } from "@/lib/pricing";
import { findRoleByPrompt, ROLE_PRESETS } from "@/lib/roles";
import { downloadText, sessionToJson, sessionToMarkdown } from "@/lib/session-export";
import { downloadPptx } from "@/lib/file-export";
import { isVisionModel } from "@/lib/providers";
import { useAppSettings } from "@/lib/settings-store";
import {
  createSession,
  deleteSession,
  updateSessions,
  useSessions,
  type Session,
} from "@/lib/sessions-store";
import type { ChatMessage } from "@/lib/types";
import { clearTransfer, useTransfer } from "@/lib/transfer";
import { buildToolMessage, parseSlashCommand } from "@/lib/tools";
import {
  IconDownload,
  IconGlobe,
  IconKey,
  IconLogo,
  IconSettings,
  IconSparkle,
  IconUpload,
} from "../icons";
import Select from "@/components/ui/select";
import Composer from "./composer";
import MessageList from "./message-list";
import ModelSelect from "./model-select";
import SessionList from "./session-list";

function uid(): string {
  return crypto.randomUUID();
}

/** 时间戳（模块级封装，避免 lint 将 Date.now 视为渲染期不纯调用） */
function timestamp(): number {
  return Date.now();
}

/**
 * 判断消息是否在请求生成图片（如「生成一张可爱的小猫咪图片」「画一幅插画」）。
 * 刻意不收「架构图/流程图」这类图表请求——那应该走 Mermaid 渲染。
 */
const IMAGE_INTENT_RE =
  /^(请|帮我|麻烦|给我|我想|我要)?[，,\s]*(画|生成|来一张|整一张|创作|制作|绘制|设计)(一?[张幅个]?)?[^。！？\n]{0,24}(图片|图像|插画|壁纸|头像|海报|照片|写真|绘画|图画|卡通|漫画|水彩|油画|素描|像素画|风景画|肖像画|CG图|logo|图标)(?!\s*的?\s*(代码|命令|脚本|接口|教程|原理|方法|步骤|工具|功能|程序|示例|语法|网站|网页))/i;

export function isImageIntent(text: string): boolean {
  return IMAGE_INTENT_RE.test(text.trim());
}

/** 把会话消息转成 OpenAI 兼容的多模态内容 */
function buildMessageContent(m: ChatMessage): ChatContent {
  if (m.images && m.images.length > 0) {
    return [
      { type: "text", text: m.content },
      ...m.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
    ];
  }
  return m.content;
}

export default function ChatApp() {
  const settings = useAppSettings();
  const sessions = useSessions();
  const transfer = useTransfer();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showParams, setShowParams] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [incomingFiles, setIncomingFiles] = useState<File[] | null>(null);
  const dragDepthRef = useRef(0);

  // 从项目页等跳转过来时：自动选中指定会话（渲染期同步调整，避免水合不一致）
  const [appliedSessionNonce, setAppliedSessionNonce] = useState(0);
  if (transfer?.sessionId && transfer.nonce !== appliedSessionNonce) {
    setAppliedSessionNonce(transfer.nonce);
    setActiveId(transfer.sessionId);
  }
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const selectedId = activeId ?? sessions[0]?.id ?? null;
  const session = sessions.find((s) => s.id === selectedId) ?? null;

  const providerId = session?.providerId ?? settings.activeProviderId;
  const provider = settings.providers[providerId] ?? Object.values(settings.providers)[0];
  const model = session?.model ?? provider?.models[0] ?? "";
  const canSend = !!provider?.apiKey && (provider?.models.length ?? 0) > 0;
  const disabledHint = !provider?.apiKey
    ? "请先在设置页配置 API Key"
    : provider && provider.models.length === 0
      ? "请先在设置页配置模型列表"
      : undefined;

  // 切换会话后滚动到底部（仅操作 DOM）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selectedId]);

  /**
   * 滚动到底部：force=true 强制（发送/切换会话）；
   * 否则仅当用户本来就在底部附近才跟随（用户上翻时不再强拉，可自由查看历史）。
   */
  const scrollToBottom = (force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      el.scrollTop = el.scrollHeight;
    }
  };

  const handleNew = () => {
    const s = createSession(
      settings.activeProviderId,
      settings.providers[settings.activeProviderId]?.models[0] ?? "",
    );
    setActiveId(s.id);
    setError(null);
    logActivity("session", "新建会话");
  };

  const handleDelete = (id: string) => {
    const target = sessions.find((s) => s.id === id);
    deleteSession(id);
    if (activeId === id) setActiveId(null);
    logActivity("session", "删除会话", target?.title);
  };

  const handleProviderChange = (pid: string) => {
    const firstModel = settings.providers[pid]?.models[0] ?? "";
    if (!session) {
      const s = createSession(pid, firstModel);
      setActiveId(s.id);
      return;
    }
    updateSessions((prev) =>
      prev.map((s) =>
        s.id === session.id
          ? { ...s, providerId: pid, model: firstModel, updatedAt: timestamp() }
          : s,
      ),
    );
  };

  const handleModelChange = (m: string) => {
    if (!m || !session) return;
    updateSessions((prev) =>
      prev.map((s) =>
        s.id === session.id ? { ...s, model: m, updatedAt: timestamp() } : s,
      ),
    );
  };

  const handleRoleChange = (roleId: string) => {
    if (!session) return;
    const preset = ROLE_PRESETS.find((r) => r.id === roleId);
    updateSessions((prev) =>
      prev.map((s) =>
        s.id === session.id
          ? { ...s, systemPrompt: preset?.prompt ?? "", updatedAt: timestamp() }
          : s,
      ),
    );
  };

  const handleParamsChange = (patch: Partial<Pick<Session, "temperature" | "maxTokens">>) => {
    if (!session) return;
    updateSessions((prev) =>
      prev.map((s) =>
        s.id === session.id ? { ...s, ...patch, updatedAt: timestamp() } : s,
      ),
    );
  };

  const handleSearchToggle = () => {
    if (!session) return;
    updateSessions((prev) =>
      prev.map((s) =>
        s.id === session.id ? { ...s, search: !s.search, updatedAt: timestamp() } : s,
      ),
    );
  };

  const handleThinkingToggle = () => {
    if (!session) return;
    updateSessions((prev) =>
      prev.map((s) =>
        s.id === session.id
          ? { ...s, thinking: s.thinking === false, updatedAt: timestamp() }
          : s,
      ),
    );
  };

  const handleToolsToggle = () => {
    if (!session) return;
    updateSessions((prev) =>
      prev.map((s) =>
        s.id === session.id
          ? { ...s, tools: s.tools !== true, updatedAt: timestamp() }
          : s,
      ),
    );
  };

  const handleExport = (format: "md" | "json" | "ppt") => {
    if (!session || session.messages.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (format === "md") {
      downloadText(
        `aidesk-${stamp}.md`,
        sessionToMarkdown(session),
        "text/markdown;charset=utf-8",
      );
    } else if (format === "json") {
      downloadText(`aidesk-${stamp}.json`, sessionToJson(session), "application/json");
    } else {
      void downloadPptx(sessionToMarkdown(session), session.title);
    }
  };

  const tokenTotals = session
    ? session.messages.reduce(
        (acc, m) => {
          if (m.usage) {
            acc.prompt += m.usage.promptTokens;
            acc.completion += m.usage.completionTokens;
          }
          return acc;
        },
        { prompt: 0, completion: 0 },
      )
    : { prompt: 0, completion: 0 };

  // 上下文用量提醒：按累计 token 用量估算占用比例
  const contextMeta = metaFor(providerId, model);
  const contextUsed = tokenTotals.prompt + tokenTotals.completion;
  const contextRatio = contextMeta.context > 0 ? contextUsed / contextMeta.context : 0;

  /** 回答完成（或失败）时的桌面通知：仅在页面处于后台时提醒 */
  const maybeNotify = useCallback(
    (title: string, preview?: string) => {
      if (
        settings.notifyOnDone &&
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        notifyComplete(title, preview);
      }
    },
    [settings.notifyOnDone],
  );

  // —— 面板级拖拽上传：整个对话窗口都是投放区（深度计数避免子元素抖动）——
  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const handleDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDraggingFiles(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // 必须阻止默认行为，drop 才能触发
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDraggingFiles(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0 && canSend && !imageMode) setIncomingFiles(files);
  };

  // 拖拽离开窗口等异常路径兜底：清理拖拽态
  useEffect(() => {
    const reset = () => {
      dragDepthRef.current = 0;
      setDraggingFiles(false);
    };
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, []);

  const handleIncomingConsumed = useCallback(() => setIncomingFiles(null), []);

  const handleSend = async (text: string, attachments: FileAttachment[]) => {
    // 消费从提示词库载入的内容
    clearTransfer();

    const target: Session =
      session ??
      createSession(
        settings.activeProviderId,
        settings.providers[settings.activeProviderId]?.models[0] ?? "",
      );
    if (activeId !== target.id) setActiveId(target.id);

    const requestProvider = settings.providers[target.providerId];
    if (!requestProvider?.apiKey) {
      setError("尚未配置 API Key，请先在设置页填写。");
      return;
    }
    if (!target.model) {
      setError("尚未选择模型，请先在设置页配置模型列表。");
      return;
    }

    // 解析 /指令：携带工具指令时，发送给模型的内容替换为「工具提示词 + 正文」
    const parsed = parseSlashCommand(text);
    const sendText = parsed.content;

    // 图片意图自动路由：普通对话里说「生成一张…图片」时，直接走图片生成
    if (!parsed.tool && isImageIntent(text)) {
      const imgProvider = settings.providers[target.providerId];
      if (imgProvider?.imageModel && imgProvider.apiKey) {
        logActivity("chat", "自动切换图片生成", sendText.slice(0, 40));
        void handleSendImage(text);
        return;
      }
      setError(
        "检测到你想生成图片：当前提供商未配置生图模型。请到设置页为该提供商添加生图模型（如 gpt-image-2），或切换到 OpenAI / Gemini 提供商后重试；也可以点输入框旁的 🎨 按钮。",
      );
      return;
    }

    // 组装用户消息：文本附件内容拼接进正文，图片附件存为 images 数组
    const textAtts = attachments.filter((a) => a.kind === "text");
    const imageAtts = attachments.filter((a) => a.kind === "image");
    let userContent = text;
    if (textAtts.length > 0) {
      const blocks = textAtts.map((a) => `【附件：${a.name}】\n${a.text}`).join("\n\n");
      userContent = userContent ? `${userContent}\n\n---\n\n${blocks}` : blocks;
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: userContent,
      images: imageAtts.map((a) => a.dataUrl!).filter(Boolean),
      createdAt: timestamp(),
    };
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      reasoning: "",
      createdAt: timestamp(),
    };
    const wasEmpty = target.messages.length === 0;

    updateSessions((prev) =>
      prev.map((s) =>
        s.id === target.id
          ? {
              ...s,
              title: wasEmpty ? (sendText || "附件对话").slice(0, 20) : s.title,
              messages: [...s.messages, userMsg, assistantMsg],
              updatedAt: timestamp(),
            }
          : s,
      ),
    );

    const payloadMessages = [...target.messages, userMsg]
      .filter((m) => m.content.trim() !== "" || (m.images?.length ?? 0) > 0)
      .map((m, idx, arr) => {
        const isLast = idx === arr.length - 1;
        const content = buildMessageContent(m);
        if (isLast && parsed.tool && typeof content === "string") {
          return { role: m.role, content: buildToolMessage(parsed.tool, sendText) };
        }
        return { role: m.role, content };
      });

    // 角色预设：在消息最前面插入系统提示词
    const requestMessages = target.systemPrompt
      ? [{ role: "system", content: target.systemPrompt }, ...payloadMessages]
      : payloadMessages;

    setStreaming(true);
    setError(null);
    scrollToBottom(true);
    logActivity(
      "chat",
      `发送消息（${target.model}）`,
      sendText ? sendText.slice(0, 80) : "附件消息",
    );

    const controller = new AbortController();
    abortRef.current = controller;

    // 流结束后把会话落盘
    const finish = () => {
      updateSessions((prev) =>
        prev.map((s) => (s.id === target.id ? { ...s, updatedAt: timestamp() } : s)),
      );
      abortRef.current = null;
    };

    // —— 流式增量按帧批量提交，避免每个 token 触发一次全量渲染 ——
    const pending = { content: "", reasoning: "" };
    let fullContent = "";
    let rafId = 0;
    const flushPending = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      const content = pending.content;
      const reasoning = pending.reasoning;
      pending.content = "";
      pending.reasoning = "";
      if (!content && !reasoning) return;
      updateSessions(
        (prev) =>
          prev.map((s) =>
            s.id === target.id
              ? {
                  ...s,
                  updatedAt: timestamp(),
                  messages: s.messages.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          content: m.content + content,
                          reasoning: (m.reasoning ?? "") + reasoning,
                        }
                      : m,
                  ),
                }
              : s,
          ),
        { persist: false },
      );
    };

    await streamChat(
      {
        baseURL: requestProvider.baseURL,
        apiKey: requestProvider.apiKey,
        model: target.model,
        messages: requestMessages,
        temperature: target.temperature,
        maxTokens: target.maxTokens,
        search: target.search,
        thinking: target.thinking !== false,
        providerId: target.providerId,
        tools: target.tools === true,
        mcpServers: settings.mcpServers.filter((s) => s.enabled),
      },
      {
        onDelta: (content, reasoning) => {
          pending.content += content;
          pending.reasoning += reasoning;
          fullContent += content;
          if (!rafId) {
            rafId = requestAnimationFrame(() => {
              rafId = 0;
              flushPending();
              scrollToBottom();
            });
          }
        },
        onUsage: (usage: UsageStats) => {
          updateSessions(
            (prev) =>
              prev.map((s) =>
                s.id === target.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsg.id ? { ...m, usage } : m,
                      ),
                    }
                  : s,
              ),
            { persist: false },
          );
        },
        onCitations: (citations) => {
          updateSessions(
            (prev) =>
              prev.map((s) =>
                s.id === target.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsg.id ? { ...m, citations } : m,
                      ),
                    }
                  : s,
              ),
            { persist: false },
          );
        },
        onToolCall: (toolCalls) => {
          updateSessions(
            (prev) =>
              prev.map((s) =>
                s.id === target.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsg.id ? { ...m, toolCalls } : m,
                      ),
                    }
                  : s,
              ),
            { persist: false },
          );
        },
        onModel: (modelUsed) => {
          updateSessions(
            (prev) =>
              prev.map((s) =>
                s.id === target.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsg.id ? { ...m, modelUsed } : m,
                      ),
                    }
                  : s,
              ),
            { persist: false },
          );
        },
        onSearchDropped: (detail) => {
          setError(
            `已开启联网搜索但未生效，已按普通模式回答。${detail ? `上游提示：${detail}` : ""}`,
          );
        },
        onDone: () => {
          flushPending();
          setStreaming(false);
          finish();
          maybeNotify(target.title, fullContent.trim());
        },
        onError: (message) => {
          flushPending();
          setStreaming(false);
          setError(message);
          maybeNotify(target.title, `⚠️ ${message}`);
          updateSessions(
            (prev) =>
              prev.map((s) =>
                s.id === target.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsg.id
                          ? { ...m, content: m.content || `⚠️ ${message}` }
                          : m,
                      ),
                      updatedAt: timestamp(),
                    }
                  : s,
              ),
            { persist: false },
          );
          finish();
        },
      },
      controller.signal,
    );
  };

  /** 图片生成：把输入当作绘图提示词，调用提供商的 /images/generations */
  const handleSendImage = async (prompt: string) => {
    clearTransfer();
    const target: Session =
      session ??
      createSession(
        settings.activeProviderId,
        settings.providers[settings.activeProviderId]?.models[0] ?? "",
      );
    if (activeId !== target.id) setActiveId(target.id);

    const requestProvider = settings.providers[target.providerId];
    if (!requestProvider?.apiKey) {
      setError("尚未配置 API Key，请先在设置页填写。");
      return;
    }
    if (!requestProvider.imageModel) {
      setError("当前提供商未配置生图模型，请到设置页添加（如 gpt-image-2）。");
      return;
    }

    const trimmed = prompt.trim();
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: timestamp(),
    };
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: timestamp(),
    };
    const wasEmpty = target.messages.length === 0;
    updateSessions((prev) =>
      prev.map((s) =>
        s.id === target.id
          ? {
              ...s,
              title: wasEmpty ? `画：${trimmed.slice(0, 14)}` : s.title,
              messages: [...s.messages, userMsg, assistantMsg],
              updatedAt: timestamp(),
            }
          : s,
      ),
    );

    setStreaming(true);
    setError(null);
    scrollToBottom(true);
    logActivity("chat", "生成图片", trimmed.slice(0, 60));

    try {
      const dataUrl = await generateImage({
        baseURL: requestProvider.baseURL,
        apiKey: requestProvider.apiKey,
        model: requestProvider.imageModel,
        prompt: trimmed,
      });
      updateSessions((prev) =>
        prev.map((s) =>
          s.id === target.id
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: "已根据描述生成图片：", images: [dataUrl] }
                    : m,
                ),
                updatedAt: timestamp(),
              }
            : s,
        ),
      );
      scrollToBottom();
      maybeNotify(target.title, "图片已生成完成");
    } catch (err) {
      const message = err instanceof Error ? err.message : "图片生成失败";
      setError(message);
      maybeNotify(target.title, `⚠️ ${message}`);
      updateSessions((prev) =>
        prev.map((s) =>
          s.id === target.id
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: `⚠️ ${message}` } : m,
                ),
                updatedAt: timestamp(),
              }
            : s,
        ),
      );
    } finally {
      setStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-3">
      {/* 顶部工具行 */}
      <div className="relative flex shrink-0 flex-wrap items-center gap-2">
        <ModelSelect
          providerId={providerId}
          model={model}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
        />
        <Select
          value={findRoleByPrompt(session?.systemPrompt)}
          onChange={(e) => handleRoleChange(e.target.value)}
          title="角色预设"
          disabled={!session}
        >
          {ROLE_PRESETS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id === "none" ? "角色预设" : `角色：${r.name}`}
            </option>
          ))}
          {findRoleByPrompt(session?.systemPrompt) === "custom" && (
            <option value="custom">角色：自定义</option>
          )}
        </Select>
        <button
          type="button"
          onClick={() => setShowParams((v) => !v)}
          disabled={!session}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            showParams
              ? "border-amber-500/50 text-orange-600 dark:text-amber-400"
              : "border-zinc-300 text-zinc-600 hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          }`}
          title="生成参数"
        >
          <IconSettings width={14} height={14} />
          参数
        </button>
        <button
          type="button"
          onClick={handleSearchToggle}
          disabled={!session}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            session?.search
              ? "border-amber-500/60 bg-amber-500/15 font-medium text-orange-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300"
              : "border-zinc-300 text-zinc-600 hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          }`}
          title="联网搜索：让模型先检索网络再回答（需提供商支持）"
        >
          <IconGlobe width={14} height={14} />
          联网
        </button>
        <button
          type="button"
          onClick={handleThinkingToggle}
          disabled={!session}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            session?.thinking !== false
              ? "border-amber-500/60 bg-amber-500/15 font-medium text-orange-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300"
              : "border-zinc-300 text-zinc-600 hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          }`}
          title="思考模式：开启后模型先深度思考再回答（DeepSeek / 通义 / OpenAI 支持，思考过程可展开查看）"
        >
          <IconSparkle width={14} height={14} />
          思考
        </button>
        <button
          type="button"
          onClick={handleToolsToggle}
          disabled={!session}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            session?.tools === true
              ? "border-amber-500/60 bg-amber-500/15 font-medium text-orange-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300"
              : "border-zinc-300 text-zinc-600 hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          }`}
          title="MCP 工具：允许模型调用你在设置页配置的 MCP 服务器（Claude 暂不支持）"
        >
          🔧 工具
        </button>

        <div className="ml-auto flex items-center gap-2">
          {tokenTotals.prompt + tokenTotals.completion > 0 && (
            <span className="hidden text-[11px] text-zinc-400 dark:text-zinc-600 sm:block">
              本会话 ↑{tokenTotals.prompt} ↓{tokenTotals.completion} tokens · 上下文{" "}
              {Math.round(contextRatio * 100)}%
            </span>
          )}
          <button
            type="button"
            onClick={() => handleExport("md")}
            disabled={!session || session.messages.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
            title="导出 Markdown"
          >
            <IconDownload width={13} height={13} />
            MD
          </button>
          <button
            type="button"
            onClick={() => handleExport("json")}
            disabled={!session || session.messages.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
            title="导出 JSON"
          >
            <IconDownload width={13} height={13} />
            JSON
          </button>
          <button
            type="button"
            onClick={() => handleExport("ppt")}
            disabled={!session || session.messages.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
            title="导出 PPT（按 Markdown 标题自动分页）"
          >
            <IconDownload width={13} height={13} />
            PPT
          </button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Select
            value={selectedId ?? ""}
            onChange={(e) => setActiveId(e.target.value || null)}
            className="max-w-[9rem]"
            title="会话"
          >
            <option value="">新对话</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={handleNew}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            新建
          </button>
        </div>

        {/* 参数面板 */}
        {showParams && session && (
          <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex min-w-[200px] flex-1 items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="shrink-0">温度</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={session.temperature ?? 0.7}
                  onChange={(e) => handleParamsChange({ temperature: Number(e.target.value) })}
                  className="flex-1 accent-orange-600"
                />
                <span className="w-10 shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-center text-xs font-medium tabular-nums dark:bg-zinc-800">
                  {(session.temperature ?? 0.7).toFixed(1)}
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="shrink-0">最大输出</span>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  value={session.maxTokens ?? 0}
                  onChange={(e) =>
                    handleParamsChange({ maxTokens: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-24 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950/60"
                  placeholder="0 = 不限"
                />
                <span className="text-xs text-zinc-400">tokens（0 = 不限）</span>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-600">
              参数仅作用于当前会话；未设置的项使用提供商默认值。
            </p>
          </div>
        )}
      </div>

      {/* 主体 */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="hidden w-60 shrink-0 lg:block">
          <SessionList
            sessions={sessions}
            activeId={selectedId}
            onSelect={setActiveId}
            onNew={handleNew}
            onDelete={handleDelete}
          />
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {draggingFiles && (
            <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-amber-500 bg-amber-500/10 backdrop-blur-[2px] dark:border-amber-400 dark:bg-amber-400/10">
              <p className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-orange-600 shadow-lg dark:bg-zinc-900 dark:text-amber-300">
                <IconUpload width={16} height={16} />
                松手添加附件（PDF / 文本 / 图片）
              </p>
            </div>
          )}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto w-full max-w-4xl">
              {session && session.messages.length > 0 ? (
                <MessageList messages={session.messages} streaming={streaming} />
              ) : (
                <EmptyChat
                  hint={
                    !provider?.apiKey
                      ? "请先在设置页配置 API Key"
                      : "开始你的第一段对话吧"
                  }
                />
              )}
            </div>
          </div>
          {error && (
            <div className="mx-auto w-full max-w-4xl px-4 pb-2 text-sm text-red-500 dark:text-red-400">
              ⚠️ {error}
            </div>
          )}
          {contextRatio >= 0.7 && session && (
            <div className="mx-auto w-full max-w-4xl px-4 pb-2">
              <p
                className={`rounded-lg px-3.5 py-2 text-xs leading-relaxed ${
                  contextRatio >= 0.95
                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }`}
              >
                ⚠️ 本会话已用约 {formatTokens(contextUsed)} / {formatTokens(contextMeta.context)}{" "}
                tokens（{Math.round(contextRatio * 100)}%），接近所选模型的上下文上限，继续对话可能丢失早期内容。
                建议新开会话，或先导出本会话存档。
              </p>
            </div>
          )}
          <Composer
            key={transfer ? `seed-${transfer.nonce}` : "plain"}
            initialText={transfer?.content ?? ""}
            seeded={!!transfer}
            onClearSeed={clearTransfer}
            disabled={!canSend}
            disabledHint={disabledHint}
            streaming={streaming}
            visionCapable={canSend ? isVisionModel(providerId, model) : undefined}
            imageMode={imageMode}
            onToggleImageMode={() => setImageMode((v) => !v)}
            onSendImage={handleSendImage}
            onSend={handleSend}
            onStop={handleStop}
            incomingFiles={incomingFiles}
            onIncomingConsumed={handleIncomingConsumed}
          />
        </div>
      </div>
    </div>
  );
}

function EmptyChat({ hint }: { hint: string }) {
  const needKey = hint.includes("API Key");
  return (
    <div className="relative flex h-full min-h-[320px] flex-col items-center justify-center gap-5 overflow-hidden text-center">
      {/* 背景柔光 */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-amber-400/20 via-orange-500/10 to-transparent blur-3xl dark:from-amber-500/15 dark:via-orange-600/10"
      />

      {/* 主图标组合 */}
      <div className="relative">
        {/* 外圈光晕 */}
        <div
          aria-hidden
          className="absolute -inset-7 rounded-[2.2rem] bg-gradient-to-br from-amber-400/25 to-orange-500/15 blur-xl dark:from-amber-500/20 dark:to-orange-600/10"
        />
        {/* 缓慢旋转的渐变描边环 */}
        <div
          aria-hidden
          className="animate-aidesk-spin-slow absolute -inset-2 rounded-[1.9rem] bg-[conic-gradient(from_0deg,transparent_0%,rgba(245,158,11,0.55)_18%,transparent_38%,transparent_60%,rgba(249,115,22,0.35)_80%,transparent_100%)]"
        />
        {/* 主体卡片 */}
        <div className="animate-aidesk-float relative flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-white shadow-xl shadow-amber-500/20 ring-1 ring-amber-500/20 dark:bg-zinc-900 dark:shadow-amber-500/10 dark:ring-white/10">
          <span className="flex h-13 w-13 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-inner">
            <IconLogo width={26} height={26} />
          </span>
        </div>
        {/* 漂浮的能力徽标 */}
        <span
          title="AI 对话"
          className="animate-aidesk-float-soft absolute -left-7 -top-5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[15px] shadow-lg shadow-zinc-900/5 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:ring-white/10"
          style={{ animationDelay: "0.4s" }}
        >
          💬
        </span>
        <span
          title="图片生成"
          className="animate-aidesk-float-soft absolute -right-8 top-1 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[15px] shadow-lg shadow-zinc-900/5 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:ring-white/10"
          style={{ animationDelay: "1.2s" }}
        >
          🎨
        </span>
        <span
          title="MCP 工具调用"
          className="animate-aidesk-float-soft absolute -bottom-4 -left-6 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[15px] shadow-lg shadow-zinc-900/5 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:ring-white/10"
          style={{ animationDelay: "2s" }}
        >
          🔧
        </span>
        <span
          title="文件对话"
          className="animate-aidesk-float-soft absolute -bottom-3 -right-5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[15px] shadow-lg shadow-zinc-900/5 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:ring-white/10"
          style={{ animationDelay: "2.8s" }}
        >
          ✨
        </span>
      </div>

      <div className="relative space-y-1.5">
        <p className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
          {hint}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          多模型对话 · 图片生成 · 图表渲染 · MCP 工具
        </p>
      </div>

      {needKey && (
        <Link
          href="/settings"
          className="relative inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition-colors hover:bg-amber-500"
        >
          <IconKey width={15} height={15} />
          去设置
        </Link>
      )}
    </div>
  );
}
