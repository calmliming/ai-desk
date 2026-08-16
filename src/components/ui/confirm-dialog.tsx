"use client";

import { useEffect } from "react";
import { resolveConfirm, useConfirmState } from "@/lib/confirm-store";

/** 全局确认弹窗（主题化，替代 window.confirm） */
export default function ConfirmDialog() {
  const state = useConfirmState();

  // Esc 关闭
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolveConfirm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  if (!state) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => resolveConfirm(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="dialog-enter w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5">
          <p className="text-base font-semibold">{state.message}</p>
          {state.detail && (
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {state.detail}
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => resolveConfirm(false)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
          >
            取消
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => resolveConfirm(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              state.danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-orange-600 hover:bg-amber-500"
            }`}
          >
            {state.confirmLabel ?? "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}
