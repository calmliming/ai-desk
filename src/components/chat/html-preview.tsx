"use client";

import { downloadText } from "@/lib/session-export";
import { IconX } from "../icons";

/** HTML/SVG 代码块预览弹窗（沙盒 iframe 渲染） */
export default function HtmlPreview({
  blocks,
  onClose,
}: {
  blocks: string[];
  onClose: () => void;
}) {
  const openInNewWindow = (block: string) => {
    const blob = new Blob([block], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p className="font-medium">预览 {blocks.length > 1 ? `（${blocks.length} 个）` : ""}</p>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            沙盒渲染，脚本受限
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            title="关闭"
          >
            <IconX width={16} height={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {blocks.map((block, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/70">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  预览 {blocks.length > 1 ? i + 1 : ""}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      `aidesk-preview-${i + 1}.html`,
                      block,
                      "text/html;charset=utf-8",
                    )
                  }
                  className="ml-auto rounded-md px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-amber-500/10 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-amber-400"
                  title="下载为 .html 文件"
                >
                  下载 HTML
                </button>
                <button
                  type="button"
                  onClick={() => openInNewWindow(block)}
                  className="rounded-md px-2 py-0.5 text-xs text-orange-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
                >
                  在新窗口打开 ↗
                </button>
              </div>
              <iframe
                title={`预览 ${i + 1}`}
                sandbox="allow-scripts"
                srcDoc={block}
                className="h-[460px] w-full bg-white"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
