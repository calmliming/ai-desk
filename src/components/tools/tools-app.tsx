"use client";

import { useRef, useState } from "react";
import { logActivity } from "@/lib/activity-store";
import { streamChat, type UsageStats } from "@/lib/chat-client";
import { useAppSettings } from "@/lib/settings-store";
import {
  TEXT_TOOLS,
  buildToolMessage,
  toolDefaultOptions,
  type TextTool,
} from "@/lib/tools";
import { clearTransfer, useTransfer } from "@/lib/transfer";
import Select from "@/components/ui/select";
import Markdown from "../chat/markdown";
import ModelSelect from "../chat/model-select";
import { IconCopy, IconStop, IconTools, IconX } from "../icons";

interface ToolResult {
  status: "idle" | "streaming" | "done" | "error";
  content: string;
  reasoning: string;
  error?: string;
  durationMs?: number;
  usage?: UsageStats;
}

const IDLE: ToolResult = { status: "idle", content: "", reasoning: "" };


export default function ToolsApp() {
  const settings = useAppSettings();
  const providers = Object.values(settings.providers);

  const [providerId, setProviderId] = useState(settings.activeProviderId);
  const provider = settings.providers[providerId] ?? providers[0];
  const [model, setModel] = useState(provider?.models[0] ?? "");

  const [tool, setTool] = useState<TextTool>(TEXT_TOOLS[0]);
  const [options, setOptions] = useState<Record<string, string>>(() =>
    toolDefaultOptions(TEXT_TOOLS[0]),
  );
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ToolResult>(IDLE);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // 从提示词库载入内容（渲染期间同步调整，避免水合不一致）
  const transfer = useTransfer();
  const [appliedNonce, setAppliedNonce] = useState(0);
  if (transfer && transfer.nonce !== appliedNonce) {
    setAppliedNonce(transfer.nonce);
    setInput(transfer.content);
  }

  const switchTool = (t: TextTool) => {
    setTool(t);
    setOptions(toolDefaultOptions(t));
    setResult(IDLE);
  };

  const handleProviderChange = (pid: string) => {
    setProviderId(pid);
    setModel(settings.providers[pid]?.models[0] ?? "");
  };

  const run = () => {
    const text = input.trim();
    if (!text || running || !provider?.apiKey || !model) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    setResult({ status: "streaming", content: "", reasoning: "" });
    setRunning(true);
    logActivity("tool", `执行「${tool.name}」`, text.slice(0, 80));
    const startedAt = Date.now();

    const finish = (patch: Partial<ToolResult>) => {
      setResult((prev) => ({ ...prev, ...patch, durationMs: Date.now() - startedAt }));
      setRunning(false);
      controllerRef.current = null;
    };

    void streamChat(
      {
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        model,
        messages: [{ role: "user", content: buildToolMessage(tool, text) }],
      },
      {
        onDelta: (content, reasoning) =>
          setResult((prev) => ({
            ...prev,
            content: prev.content + content,
            reasoning: prev.reasoning + reasoning,
          })),
        onUsage: (usage) => setResult((prev) => ({ ...prev, usage })),
        onDone: () => finish({ status: "done" }),
        onError: (message) => finish({ status: "error", error: message }),
      },
      controller.signal,
    );
  };

  const stop = () => {
    controllerRef.current?.abort();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪贴板失败
    }
  };

  return (
    <div className="grid h-[calc(100dvh-4rem)] gap-4 lg:grid-cols-[240px_1fr]">
      {/* 工具列表（桌面） */}
      <div className="hidden flex-col gap-1.5 overflow-y-auto pr-1 lg:flex">
        {TEXT_TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTool(t)}
            className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${
              t.id === tool.id
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="text-base">{t.emoji}</span>
              {t.name}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t.description}
            </p>
          </button>
        ))}
      </div>

      {/* 右侧工作区 */}
      <div className="flex min-w-0 flex-col gap-3">
        {/* 顶部：模型与工具选择 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ModelSelect
            providerId={providerId}
            model={model}
            onProviderChange={handleProviderChange}
            onModelChange={setModel}
          />
          <Select
            value={tool.id}
            onChange={(e) => switchTool(TEXT_TOOLS.find((t) => t.id === e.target.value)!)}
            className="lg:hidden"
          >
            {TEXT_TOOLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.name}
              </option>
            ))}
          </Select>
        </div>

        {!provider?.apiKey && (
          <p className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
            ⚠️ 当前提供商尚未配置 API Key，请先到设置页填写。
          </p>
        )}

        {/* 工具选项 */}
        {tool.options && tool.options.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {tool.options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="text-xs">{o.label}</span>
                <Select
                  value={options[o.id] ?? o.default}
                  onChange={(e) => setOptions((prev) => ({ ...prev, [o.id]: e.target.value }))}

                >
                  {o.choices?.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
        )}

        {/* 输入 */}
        <div className="shrink-0">
          {transfer && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-orange-700 dark:text-amber-300">
              <span className="min-w-0 flex-1 truncate">已从提示词库载入内容</span>
              <button
                type="button"
                onClick={() => {
                  clearTransfer();
                  setInput("");
                }}
                className="flex shrink-0 items-center gap-0.5 font-medium transition-colors hover:text-amber-500"
              >
                <IconX width={11} height={11} />
                清除
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 transition-colors focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-950/60">
          <textarea
            rows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                run();
              }
            }}
            placeholder={`${tool.emoji} ${tool.placeholder}（Ctrl/⌘ + Enter 执行）`}
            className="min-h-[100px] flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-zinc-400"
          />
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-red-500/10 px-3.5 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/20"
            >
              <IconStop width={15} height={15} />
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={!input.trim() || !provider?.apiKey || !model}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconTools width={15} height={15} />
              执行
            </button>
          )}
          </div>
        </div>

        {/* 结果 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {result.status === "idle" ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="text-3xl">{tool.emoji}</span>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                粘贴文本并执行，结果将在这里流式显示
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
              <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
                <span
                  className={`h-2 w-2 rounded-full ${
                    result.status === "streaming"
                      ? "animate-pulse bg-amber-500"
                      : result.status === "error"
                        ? "bg-red-500"
                        : "bg-emerald-500"
                  }`}
                />
                <p className="text-sm font-medium">
                  {tool.emoji} {tool.name}
                  {result.status === "error" ? " · 出错" : ""}
                </p>
                {result.durationMs !== undefined && (
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
                    {(result.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {result.usage && (
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
                    ↑{result.usage.promptTokens} ↓{result.usage.completionTokens}
                  </span>
                )}
                {result.content && (
                  <button
                    type="button"
                    onClick={copy}
                    className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:text-orange-600 dark:text-zinc-400 dark:hover:text-amber-400"
                  >
                    <IconCopy width={13} height={13} />
                    {copied ? "已复制" : "复制"}
                  </button>
                )}
              </header>
              <div className="p-4">
                {result.status === "error" && (
                  <p className="text-sm text-red-500 dark:text-red-400">⚠️ {result.error}</p>
                )}
                {result.reasoning && (
                  <details
                    open={result.status === "streaming"}
                    className="mb-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70"
                  >
                    <summary className="cursor-pointer select-none text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      思考过程
                    </summary>
                    <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
                      {result.reasoning}
                    </p>
                  </details>
                )}
                {result.content ? (
                  <Markdown>{result.content}</Markdown>
                ) : result.status === "streaming" ? (
                  <span className="inline-flex items-center gap-1 py-1.5" aria-label="正在生成">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
