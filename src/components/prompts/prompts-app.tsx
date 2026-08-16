"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updatePrompts,
  usePrompts,
  type PromptTemplate,
} from "@/lib/prompts-store";
import { extractVariables, fillTemplate } from "@/lib/template-utils";
import { setTransfer } from "@/lib/transfer";
import Select from "@/components/ui/select";
import {
  IconArrowRight,
  IconCopy,
  IconDownload,
  IconPlus,
  IconPrompts,
  IconTrash,
  IconUpload,
} from "../icons";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-950/60";


function uid(): string {
  return crypto.randomUUID();
}

export default function PromptsApp() {
  const router = useRouter();
  const prompts = usePrompts();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const effectiveId = selectedId ?? prompts[0]?.id ?? null;
  const prompt = prompts.find((p) => p.id === effectiveId) ?? null;
  const variables = prompt ? extractVariables(prompt.content) : [];
  const filled = prompt ? fillTemplate(prompt.content, values) : "";
  const unfilledCount = variables.filter((v) => !values[v]?.trim()).length;
  const filtered = prompts.filter(
    (p) => !query.trim() || p.title.includes(query) || p.content.includes(query),
  );

  const selectPrompt = (id: string) => {
    setSelectedId(id || null);
    setValues({});
  };

  const updatePrompt = (patch: Partial<PromptTemplate>) => {
    if (!prompt) return;
    updatePrompts((prev) =>
      prev.map((p) => (p.id === prompt.id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
    );
  };

  const handleNew = () => {
    const now = Date.now();
    const p: PromptTemplate = {
      id: uid(),
      title: "未命名提示词",
      content: "",
      createdAt: now,
      updatedAt: now,
    };
    updatePrompts((prev) => [p, ...prev]);
    setSelectedId(p.id);
    setValues({});
  };

  const handleDelete = () => {
    if (!prompt) return;
    if (!window.confirm(`确定删除「${prompt.title}」？`)) return;
    updatePrompts((prev) => prev.filter((p) => p.id !== prompt.id));
    setSelectedId(null);
    setValues({});
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪贴板失败
    }
  };

  const useInChat = () => {
    setTransfer(filled);
    router.push("/chat");
  };

  const useInTools = () => {
    setTransfer(filled);
    router.push("/tools");
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(prompts, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aidesk-prompts.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        const arr = Array.isArray(parsed)
          ? parsed
          : (parsed as { prompts?: unknown[] })?.prompts;
        if (!Array.isArray(arr)) throw new Error("结构不正确");
        const now = Date.now();
        const items: PromptTemplate[] = arr
          .filter(
            (x): x is { title: string; content: string } =>
              !!x &&
              typeof (x as { title?: unknown }).title === "string" &&
              typeof (x as { content?: unknown }).content === "string",
          )
          .map((x) => ({
            id: uid(),
            title: x.title,
            content: x.content,
            createdAt: now,
            updatedAt: now,
          }));
        if (items.length === 0) throw new Error("没有有效条目");
        updatePrompts((prev) => [...items, ...prev]);
        setSelectedId(items[0].id);
        setValues({});
      } catch {
        window.alert("导入失败：文件不是有效的 JSON，或缺少 title/content 字段。");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-3">
      {/* 顶部工具条 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select
          value={effectiveId ?? ""}
          onChange={(e) => selectPrompt(e.target.value)}
          className="max-w-[14rem] lg:hidden"
        >
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索提示词…"
          className={`${inputCls} hidden w-56 lg:block`}
        />
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          <IconPlus width={14} height={14} />
          新建
        </button>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          >
            <IconUpload width={14} height={14} />
            导入
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          >
            <IconDownload width={14} height={14} />
            导出
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
        </span>
      </div>

      {/* 主体 */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* 列表（桌面） */}
        <div className="hidden w-60 shrink-0 flex-col gap-1.5 overflow-y-auto pr-1 lg:flex">
          {filtered.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
              没有匹配的提示词
            </p>
          )}
          {filtered.map((p) => {
            const vars = extractVariables(p.content);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPrompt(p.id)}
                className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  p.id === effectiveId
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                }`}
              >
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {p.builtin && <span title="内置模板">⭐</span>}
                  <span className="truncate">{p.title}</span>
                </p>
                <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {p.content.split("\n")[0].slice(0, 40)}
                </p>
                {vars.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-amber-500 dark:text-amber-400">
                    {vars.length} 个变量：{vars.join("、")}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* 编辑器 */}
        {prompt ? (
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
            <input
              type="text"
              value={prompt.title}
              onChange={(e) => updatePrompt({ title: e.target.value })}
              className="shrink-0 rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold tracking-tight outline-none transition-colors focus:border-amber-500/40 dark:bg-transparent"
              placeholder="提示词标题"
            />
            <textarea
              value={prompt.content}
              onChange={(e) => updatePrompt({ content: e.target.value })}
              placeholder={"提示词正文，可用 {{变量}} 占位，例如：\n\n将以下内容翻译成{{目标语言}}：\n{{内容}}"}
              className={`${inputCls} min-h-[180px] flex-1 resize-none font-mono text-[13px] leading-relaxed`}
            />

            {variables.length > 0 && (
              <div className="shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
                <p className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  填写变量
                  {unfilledCount > 0 && (
                    <span className="font-normal normal-case text-amber-500">
                      还有 {unfilledCount} 个未填写
                    </span>
                  )}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {variables.map((v) => (
                    <label key={v} className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {`{{${v}}}`}
                      </span>
                      <input
                        type="text"
                        value={values[v] ?? ""}
                        onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                        className={inputCls}
                        placeholder={`填写 ${v}…`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                预览（填充后的内容）
              </p>
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 px-3.5 py-3 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
                {filled || "（暂无内容）"}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copy(filled)}
                disabled={!filled.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
              >
                <IconCopy width={14} height={14} />
                {copied ? "已复制" : "复制内容"}
              </button>
              <button
                type="button"
                onClick={useInChat}
                disabled={!filled.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                在对话中使用
                <IconArrowRight width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={useInTools}
                disabled={!filled.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600/10 px-3.5 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-600/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-300"
              >
                在文本工具中使用
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
              >
                <IconTrash width={14} height={14} />
                删除
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 text-amber-500">
              <IconPrompts width={26} height={26} />
            </span>
            <p className="font-medium text-zinc-600 dark:text-zinc-300">
              {prompts.length === 0 ? "创建你的第一个提示词" : "从左侧选择一个提示词"}
            </p>
            {prompts.length === 0 && (
              <button
                type="button"
                onClick={handleNew}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
              >
                <IconPlus width={14} height={14} />
                新建提示词
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
