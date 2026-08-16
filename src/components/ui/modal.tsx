"use client";

import { useEffect, type ReactNode } from "react";
import { IconX } from "../icons";

/**
 * 主题化表单弹窗（Modal）：
 * 遮罩 + 居中卡片，header 标题/描述，body 表单内容，footer 取消/确认。
 * 支持 Esc / 点击遮罩关闭、确认按钮禁用态与危险态。
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  onConfirm,
  confirmLabel = "确定",
  cancelLabel = "取消",
  confirmDisabled = false,
  danger = false,
  maxWidthClass = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  danger?: boolean;
  maxWidthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`dialog-enter flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-base font-semibold">{title}</p>
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            title="关闭"
          >
            <IconX width={16} height={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
          >
            {cancelLabel}
          </button>
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                danger ? "bg-red-600 hover:bg-red-500" : "bg-orange-600 hover:bg-amber-500"
              }`}
            >
              {confirmLabel}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
