"use client";

import { dismissToast, useToasts } from "@/lib/toast-store";
import { IconX } from "../icons";

/** 全局 Toast 视口（右下角堆叠） */
export default function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;

  const styles = {
    success: "border-emerald-500 text-emerald-700 dark:text-emerald-300",
    error: "border-red-500 text-red-600 dark:text-red-400",
    info: "border-amber-500 text-zinc-700 dark:text-zinc-200",
  } as const;

  const icons = {
    success: "✓",
    error: "⚠",
    info: "ℹ",
  } as const;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`toast-enter pointer-events-auto flex items-start gap-2.5 rounded-xl border border-zinc-200 border-l-4 bg-white px-4 py-3 shadow-lg shadow-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40 ${styles[t.type]}`}
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold dark:bg-zinc-800">
            {icons[t.type]}
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed">{t.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            title="关闭"
          >
            <IconX width={12} height={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
