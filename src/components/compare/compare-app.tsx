"use client";

import { useRef, useState } from "react";
import { logActivity } from "@/lib/activity-store";
import { streamChat, type UsageStats } from "@/lib/chat-client";
import {
  MAX_COMPARE_SLOTS,
  slotKey,
  updateCompareSlots,
  useCompareSlots,
} from "@/lib/compare-store";
import { useAppSettings } from "@/lib/settings-store";
import type { Citation } from "@/lib/types";
import Select from "@/components/ui/select";
import { IconCompare, IconCopy, IconGlobe, IconPlus, IconStop, IconX } from "../icons";
import Markdown from "../chat/markdown";

interface ResultState {
  status: "pending" | "streaming" | "done" | "error";
  content: string;
  reasoning: string;
  error?: string;
  durationMs?: number;
  usage?: UsageStats;
  citations?: Citation[];
}

const EMPTY_RESULT: ResultState = { status: "pending", content: "", reasoning: "" };

export default function CompareApp() {
  const settings = useAppSettings();
  const slots = useCompareSlots();

  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<Record<string, ResultState>>({});
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const controllersRef = useRef<AbortController[]>([]);

  // —— 槽位选择 ——
  const providers = Object.values(settings.providers);
  const [addProviderId, setAddProviderId] = useState(settings.activeProviderId);
  const addProvider = settings.providers[addProviderId] ?? providers[0];
  const [addModel, setAddModel] = useState(addProvider?.models[0] ?? "");

  const handleAdd = () => {
    if (!addModel) return;
    if (slots.length >= MAX_COMPARE_SLOTS) return;
    if (slots.some((s) => s.providerId === addProviderId && s.model === addModel)) return;
    updateCompareSlots((prev) => [...prev, { providerId: addProviderId, model: addModel }]);
  };

  const handleRemove = (key: string) => {
    updateCompareSlots((prev) => prev.filter((s) => slotKey(s) !== key));
  };

  const handleProviderChange = (pid: string) => {
    setAddProviderId(pid);
    setAddModel(settings.providers[pid]?.models[0] ?? "");
  };

  // —— 发起对比 ——
  const start = () => {
    const q = question.trim();
    if (!q || slots.length === 0 || running) return;

    const initial: Record<string, ResultState> = {};
    for (const s of slots) initial[slotKey(s)] = { ...EMPTY_RESULT };
    setResults(initial);
    setRunning(true);
    logActivity(
      "compare",
      "发起模型对比",
      `${slots.length} 个模型 · ${q.slice(0, 60)}`,
    );

    const startedAt = Date.now();
    const controllers: AbortController[] = [];
    controllersRef.current = controllers;
    let finished = 0;

    const finishSlot = (key: string, patch: Partial<ResultState>) => {
      setResults((prev) => {
        const cur = prev[key] ?? EMPTY_RESULT;
        const durationMs = Date.now() - startedAt;
        return { ...prev, [key]: { ...cur, ...patch, durationMs } };
      });
      finished += 1;
      if (finished >= slots.length) setRunning(false);
    };

    for (const slot of slots) {
      const key = slotKey(slot);
      const provider = settings.providers[slot.providerId];
      const controller = new AbortController();
      controllers.push(controller);

      if (!provider?.apiKey) {
        finishSlot(key, { status: "error", error: "未配置 API Key，请先在设置页填写。" });
        continue;
      }

      setResults((prev) => ({ ...prev, [key]: { ...prev[key], status: "streaming" } }));

      void streamChat(
        {
          baseURL: provider.baseURL,
          apiKey: provider.apiKey,
          model: slot.model,
          messages: [{ role: "user", content: q }],
          search,
          providerId: slot.providerId,
        },
        {
          onDelta: (content, reasoning) => {
            setResults((prev) => {
              const cur = prev[key] ?? EMPTY_RESULT;
              return {
                ...prev,
                [key]: {
                  ...cur,
                  content: cur.content + content,
                  reasoning: cur.reasoning + reasoning,
                },
              };
            });
          },
          onUsage: (usage) => {
            setResults((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY_RESULT), usage } }));
          },
          onCitations: (citations) => {
            setResults((prev) => ({
              ...prev,
              [key]: { ...(prev[key] ?? EMPTY_RESULT), citations },
            }));
          },
          onDone: () => finishSlot(key, { status: "done" }),
          onError: (message) => finishSlot(key, { status: "error", error: message }),
        },
        controller.signal,
      );
    }
  };

  const stopAll = () => {
    for (const c of controllersRef.current) c.abort();
    controllersRef.current = [];
  };

  const copy = async (key: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      // 剪贴板不可用时静默失败
    }
  };

  const copyAll = async () => {
    const text = slots
      .map((s) => {
        const r = results[slotKey(s)];
        const provider = settings.providers[s.providerId];
        const head = `## ${provider?.name ?? s.providerId} · ${s.model}\n`;
        return `${head}${r?.content ?? ""}`;
      })
      .join("\n\n---\n\n");
    await copy("__all__", text);
  };

  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-3">
      {/* 顶部：选择参与对比的模型 */}
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={addProviderId}
            onChange={(e) => handleProviderChange(e.target.value)}
            title="提供商"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.apiKey ? "" : " · 未配置 Key"}
              </option>
            ))}
          </Select>
          <Select
            value={addModel}
            onChange={(e) => setAddModel(e.target.value)}
            title="模型"
          >
            {(addProvider?.models ?? []).length === 0 && <option value="">请先配置模型</option>}
            {addProvider?.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!addModel || slots.length >= MAX_COMPARE_SLOTS}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          >
            <IconPlus width={14} height={14} />
            添加
          </button>
          <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-600">
            最多 {MAX_COMPARE_SLOTS} 个模型
          </span>
        </div>
        {slots.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => {
              const p = settings.providers[s.providerId];
              return (
                <span
                  key={slotKey(s)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 py-1 pl-3 pr-1.5 text-xs font-medium text-orange-700 dark:text-amber-300"
                >
                  {p?.name ?? s.providerId} · {s.model}
                  <button
                    type="button"
                    onClick={() => handleRemove(slotKey(s))}
                    className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-amber-400 transition-colors hover:bg-amber-500/20 hover:text-orange-600 dark:hover:text-amber-300"
                    title="移除"
                  >
                    <IconX width={11} height={11} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 问题输入 */}
      <div className="shrink-0 flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 transition-colors focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-950/60">
        <textarea
          rows={1}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
          }}
          placeholder="输入一个问题，同时发给多个模型……（Ctrl/⌘ + Enter 发起对比）"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
              e.preventDefault();
              start();
            }
          }}
          className="max-h-[140px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-zinc-400"
        />
        <button
          type="button"
          onClick={() => setSearch((v) => !v)}
            disabled={running}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              search
                ? "border-amber-500/60 bg-amber-500/15 text-orange-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300"
                : "border-zinc-300 text-zinc-600 hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
            }`}
            title="联网搜索（需提供商支持）"
          >
            <IconGlobe width={15} height={15} />
            联网
          </button>
        {running ? (
          <button
            type="button"
            onClick={stopAll}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-red-500/10 px-3.5 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/20"
          >
            <IconStop width={15} height={15} />
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={!question.trim() || slots.length === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconCompare width={15} height={15} />
            开始对比
          </button>
        )}
      </div>

      {/* 结果区 */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {!hasResults ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 text-amber-500">
              <IconCompare width={26} height={26} />
            </span>
            <p className="font-medium text-zinc-600 dark:text-zinc-300">
              {slots.length === 0
                ? "先添加参与对比的模型"
                : "输入问题，一键获取多个模型的回答"}
            </p>
            <p className="max-w-md text-sm text-zinc-400 dark:text-zinc-500">
              同一问题将并发发送给所有选中的模型，回答完成后可对比质量、速度与风格。
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-zinc-400 dark:text-zinc-600">
                {slots.length} 个模型 · 结果按完成顺序实时更新
              </p>
              {Object.values(results).some((r) => r.status === "done") && (
                <button
                  type="button"
                  onClick={copyAll}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:text-orange-600 dark:text-zinc-400 dark:hover:text-amber-400"
                >
                  <IconCopy width={13} height={13} />
                  {copiedKey === "__all__" ? "已复制" : "复制全部"}
                </button>
              )}
            </div>
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {slots.map((s) => {
                const key = slotKey(s);
                const r = results[key] ?? EMPTY_RESULT;
                const p = settings.providers[s.providerId];
                return (
                  <ResultCard
                    key={key}
                    title={`${p?.name ?? s.providerId} · ${s.model}`}
                    result={r}
                    copied={copiedKey === key}
                    onCopy={() => copy(key, r.content)}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  title,
  result,
  copied,
  onCopy,
}: {
  title: string;
  result: ResultState;
  copied: boolean;
  onCopy: () => void;
}) {
  const statusDot = {
    pending: "bg-zinc-300 dark:bg-zinc-600",
    streaming: "animate-pulse bg-amber-500",
    done: "bg-emerald-500",
    error: "bg-red-500",
  }[result.status];

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
          {title}
        </p>
        {result.durationMs !== undefined && (
          <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-600">
            {(result.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        {result.usage && (
          <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-600">
            ↑{result.usage.promptTokens} ↓{result.usage.completionTokens}
          </span>
        )}
        {result.content && (
          <button
            type="button"
            onClick={onCopy}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-orange-600 dark:hover:text-amber-400"
            title="复制回答"
          >
            {copied ? (
              <span className="text-[10px] font-medium text-emerald-500">✓</span>
            ) : (
              <IconCopy width={13} height={13} />
            )}
          </button>
        )}
      </header>
      <div className="min-h-[8rem] flex-1 p-4">
        {result.status === "pending" && (
          <div className="flex h-full min-h-[6rem] items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-amber-500" />
          </div>
        )}
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
        {result.citations && result.citations.length > 0 && (
          <div className="mt-3 space-y-0.5 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">📚 引用来源</p>
            <ul className="space-y-0.5">
              {result.citations.map((c, i) => (
                <li key={c.url} className="truncate">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-orange-600 hover:underline dark:text-amber-400"
                    title={c.url}
                  >
                    [{i + 1}] {c.title || c.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
