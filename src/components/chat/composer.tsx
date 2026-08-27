"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { logActivity } from "@/lib/activity-store";
import { parseAttachment, type FileAttachment } from "@/lib/file-reader";
import { createRecognizer, speechErrorText, speechSupported, type Recognizer } from "@/lib/speech";
import { toast } from "@/lib/toast-store";
import { SLASH_COMMANDS } from "@/lib/tools";
import { IconPaperclip, IconSend, IconStop, IconX } from "../icons";

const ACCEPT =
  ".txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.c,.cpp,.h,.go,.rs,.rb,.php,.swift,.kt,.sh,.bash,.yaml,.yml,.toml,.log,.sql,.html,.css,.xml,.pdf,image/png,image/jpeg,image/webp,image/gif";

/** 语音能力在运行期不会变化，订阅是空实现；快照区分 SSR / 客户端即可。 */
const subscribeSpeech = () => () => {};
const getSpeechOk = () => speechSupported();
const getSpeechOkServer = () => false;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function Composer({
  disabled,
  disabledHint,
  streaming,
  visionCapable,
  imageMode,
  onToggleImageMode,
  onSendImage,
  initialText,
  seeded,
  onClearSeed,
  incomingFiles,
  onIncomingConsumed,
  onSend,
  onStop,
}: {
  disabled: boolean;
  disabledHint?: string;
  streaming: boolean;
  /** 当前所选模型是否支持图片输入 */
  visionCapable?: boolean;
  /** 图片生成模式：输入作为绘图提示词 */
  imageMode?: boolean;
  onToggleImageMode?: () => void;
  onSendImage?: (prompt: string) => void;
  /** 从提示词库载入的初始内容（配合 key 重挂载生效） */
  initialText?: string;
  seeded?: boolean;
  onClearSeed?: () => void;
  /** 外层面板拖拽落下的文件（由 ChatApp 统一接管拖拽后传入） */
  incomingFiles?: File[] | null;
  onIncomingConsumed?: () => void;
  onSend: (text: string, attachments: FileAttachment[]) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuSuppressed, setMenuSuppressed] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  // 语音能力需在客户端检测；SSR 快照统一按「不支持」渲染，避免 hydration 不匹配。
  const speechOk = useSyncExternalStore(subscribeSpeech, getSpeechOk, getSpeechOkServer);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<Recognizer | null>(null);

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
    if (disabled || streaming) return;
    if (imageMode && onSendImage) {
      if (!value) return;
      onSendImage(value);
    } else {
      if (!value && attachments.length === 0) return;
      onSend(value, attachments);
      setAttachments([]);
      setAttachError(null);
    }
    setText("");
    setMenuIndex(0);
    if (ref.current) ref.current.style.height = "auto";
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
  };

  /** 统一的文件处理管线（选择器 / 粘贴 / 外层面板拖拽共用） */
  const processFiles = async (files: File[]) => {
    setAttachBusy(true);
    setAttachError(null);
    const added: FileAttachment[] = [];
    for (const file of files) {
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

  // 外层面板（整个对话窗口）拖入的文件在这里消化。
  // processFiles 由 React Compiler 自动记忆化，无需手动 useCallback。
  useEffect(() => {
    if (incomingFiles && incomingFiles.length > 0) {
      void processFiles(incomingFiles);
      onIncomingConsumed?.();
    }
  }, [incomingFiles, onIncomingConsumed]);

  /** 卸载时停止语音识别 */
  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        // 忽略
      }
    };
  }, []);

  /** 粘贴：截图 / 复制的文件直接从剪贴板读取 */
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void processFiles(files);
    }
  };

  /** 语音输入：开始 / 停止一次识别 */
  const toggleVoice = () => {
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {
        // 忽略
      }
      return;
    }
    const rec = createRecognizer();
    if (!rec) {
      toast.error("当前浏览器不支持语音输入（请使用 Chrome / Edge / Safari）");
      return;
    }
    const baseText = text; // 识别期间输入框内容快照
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const transcript = r?.[0]?.transcript ?? "";
        if (r?.isFinal) finalText += transcript;
        else interim += transcript;
      }
      setText(baseText + finalText + interim);
    };
    rec.onerror = (e) => {
      setListening(false);
      recRef.current = null;
      toast.error(speechErrorText(e.error));
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      logActivity("chat", "开始语音输入");
    } catch {
      toast.error("无法启动语音识别");
      recRef.current = null;
    }
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
          disabled={streaming || imageMode}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-900 dark:hover:text-amber-400 ${
            attachBusy ? "animate-pulse" : ""
          }`}
          title="添加附件（文本 / PDF / 图片）"
        >
          <IconPaperclip width={17} height={17} />
        </button>
        <button
          type="button"
          onClick={toggleVoice}
          disabled={streaming || !speechOk}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            listening
              ? "animate-pulse bg-red-500/15 text-red-500"
              : "text-zinc-400 hover:bg-zinc-100 hover:text-orange-600 dark:hover:bg-zinc-900 dark:hover:text-amber-400"
          }`}
          title={
            listening
              ? "正在聆听，点击停止"
              : speechOk
                ? "语音输入（中文）"
                : "当前浏览器不支持语音输入"
          }
        >
          🎤
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
          onPaste={handlePaste}
          placeholder={
            disabled && disabledHint
              ? disabledHint
              : imageMode
                ? "描述你想生成的画面…（如：夕阳下的富士山，浮世绘风格）"
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
          <>
            {onToggleImageMode && (
              <button
                type="button"
                onClick={onToggleImageMode}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  imageMode
                    ? "bg-amber-500/15 text-orange-600 ring-1 ring-amber-500/40 dark:text-amber-400"
                    : "text-zinc-400 hover:bg-zinc-100 hover:text-orange-600 dark:hover:bg-zinc-900 dark:hover:text-amber-400"
                }`}
                title={imageMode ? "退出图片生成模式" : "图片生成：输入描述直接生成一张图片（需提供商配置生图模型）"}
              >
                🎨
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={
                disabled || (imageMode ? !text.trim() : !text.trim() && attachments.length === 0)
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
              title={imageMode ? "生成图片" : "发送"}
            >
              <IconSend width={16} height={16} />
            </button>
          </>
        )}
      </div>
      {attachError && (
        <p className="mt-1.5 px-1 text-xs text-red-500 dark:text-red-400">⚠️ {attachError}</p>
      )}
      {!attachError &&
        visionCapable === false &&
        attachments.some((a) => a.kind === "image") && (
          <p className="mt-1.5 px-1 text-xs text-amber-600 dark:text-amber-400">
            ⚠️ 当前模型可能不支持图片，请在左上角切换到带「视觉」标记的模型（如
            deepseek-v4-flash-vision-exp）。
          </p>
        )}
      <p className="mt-1.5 px-1 text-[11px] text-zinc-400 dark:text-zinc-600">
        {imageMode
          ? "图片生成模式：输入画面描述后发送，图片由提供商的生图模型生成，请注意甄别。"
          : "支持上传文本文件、PDF 与图片（图片需要视觉模型）；可直接粘贴截图，或把文件拖进对话窗口任意位置；点击 🎤 语音输入；内容由 AI 生成，请注意甄别。"}
      </p>
      </div>
    </div>
  );
}
