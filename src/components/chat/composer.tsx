"use client";

import { useRef, useState } from "react";
import { logActivity } from "@/lib/activity-store";
import { parseAttachment, type FileAttachment } from "@/lib/file-reader";
import { SLASH_COMMANDS } from "@/lib/tools";
import { IconPaperclip, IconSend, IconStop, IconX } from "../icons";

const ACCEPT =
  ".txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.c,.cpp,.h,.go,.rs,.rb,.php,.swift,.kt,.sh,.bash,.yaml,.yml,.toml,.log,.sql,.html,.css,.xml,.pdf,image/png,image/jpeg,image/webp,image/gif";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function Composer({
  disabled,
  disabledHint,
  streaming,
  initialText,
  seeded,
  onClearSeed,
  onSend,
  onStop,
}: {
  disabled: boolean;
  disabledHint?: string;
  streaming: boolean;
  /** 从提示词库载入的初始内容（配合 key 重挂载生效） */
  initialText?: string;
  seeded?: boolean;
  onClearSeed?: () => void;
  onSend: (text: string, attachments: FileAttachment[]) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuSuppressed, setMenuSuppressed] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 输入框以 / 开头且无空格时显示快捷指令菜单
  const slashMatch = !disabled && !streaming ? text.match(/^\/([^\s\n]*)$/) : null;
  const menuOpen = !!slashMatch && menuSuppressed !== text;
  const query = slashMatch?.[1] ?? "";
  const suggestions = menuOpen
    ? SLASH_COMMANDS.filter(
        (c) => c.token.startsWith(query) || c.token.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 6)
    : [];
  const safeIndex = Math.min(menuIndex, Math.max(suggestions.length - 1, 0));

  const selectCommand = (token: string) => {
    setText(`/${token} `);
    setMenuIndex(0);
    ref.current?.focus();
  };

  const submit = () => {
    const value = text.trim();
    if ((!value && attachments.length === 0) || disabled || streaming) return;
    onSend(value, attachments);
    setText("");
    setAttachments([]);
    setAttachError(null);
    setMenuIndex(0);
    if (ref.current) ref.current.style.height = "auto";
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachBusy(true);
    setAttachError(null);
    const added: FileAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await parseAttachment(file));
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : "文件解析失败");
      }
    }
    setAttachments((prev) => [...prev, ...added]);
    if (added.length > 0) {
      logActivity("file", `添加附件（${added.length} 个）`, added.map((a) => a.name).join("、"));
    }
    setAttachBusy(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectCommand(suggestions[safeIndex].token);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuSuppressed(text);
        return;
      }
    }
    // 中文输入法组合期间不触发发送
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mx-auto w-full max-w-4xl">
      {seeded && initialText && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-orange-700 dark:text-amber-300">
          <span className="min-w-0 flex-1 truncate">已从提示词库载入内容</span>
          <button
            type="button"
            onClick={onClearSeed}
            className="flex shrink-0 items-center gap-0.5 font-medium transition-colors hover:text-amber-500"
          >
            <IconX width={11} height={11} />
            清除
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span
              key={`${a.name}-${i}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 py-1 pl-3 pr-1.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300"
            >
              <span className="truncate">
                {a.kind === "image" ? "🖼️" : "📄"} {a.name}
              </span>
              <span className="shrink-0 text-[10px] text-zinc-400">{formatSize(a.size)}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                title="移除附件"
              >
                <IconX width={10} height={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 transition-colors focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-950/60">
        {menuOpen && suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 z-10 mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <p className="border-b border-zinc-100 px-3 py-1.5 text-[11px] font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
              快捷指令（↑↓ 选择，Enter 确认，Esc 关闭）
            </p>
            {suggestions.map(({ token, tool }, i) => (
              <button
                key={token}
                type="button"
                onMouseEnter={() => setMenuIndex(i)}
                onClick={() => selectCommand(token)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  i === safeIndex ? "bg-amber-500/10" : ""
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-xs">
                  {tool.emoji}
                </span>
                <span className="text-sm font-medium">/{token}</span>
                <span className="ml-auto truncate pl-3 text-xs text-zinc-400 dark:text-zinc-500">
                  {tool.name}
                </span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={streaming}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-900 dark:hover:text-amber-400 ${
            attachBusy ? "animate-pulse" : ""
          }`}
          title="添加附件（文本 / PDF / 图片）"
        >
          <IconPaperclip width={17} height={17} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled && disabledHint
              ? disabledHint
              : "输入消息，Enter 发送，Shift+Enter 换行；输入 / 使用快捷指令"
          }
          className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500 transition-colors hover:bg-red-500/20"
            title="停止生成"
          >
            <IconStop width={17} height={17} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={disabled || (!text.trim() && attachments.length === 0)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            title="发送"
          >
            <IconSend width={16} height={16} />
          </button>
        )}
      </div>
      {attachError && (
        <p className="mt-1.5 px-1 text-xs text-red-500 dark:text-red-400">⚠️ {attachError}</p>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-zinc-400 dark:text-zinc-600">
        支持上传文本文件、PDF 与图片（图片需要视觉模型）；内容由 AI 生成，请注意甄别。
      </p>
      </div>
    </div>
  );
}
