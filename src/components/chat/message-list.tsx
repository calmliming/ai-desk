"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { IconCopy, IconLogo } from "../icons";
import Markdown from "./markdown";

export default function MessageList({
  messages,
  streaming,
}: {
  messages: ChatMessage[];
  streaming: boolean;
}) {
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;

  return (
    <div className="space-y-6">
      {messages.map((m) => {
        if (m.role === "user") {
          return (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%]">
                {m.images && m.images.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                    {m.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={`附件图片 ${i + 1}`}
                        className="h-24 w-24 rounded-xl border border-zinc-200 object-cover dark:border-zinc-800"
                      />
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-amber-500 to-orange-600 px-4 py-2.5 text-[0.925rem] leading-relaxed text-white shadow-md shadow-amber-500/20">
                  {m.content}
                </div>
              </div>
            </div>
          );
        }
        const isLast = m.id === lastId;
        return (
          <div key={m.id} className="group flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20 ring-1 ring-white/20">
              <IconLogo width={14} height={14} />
            </span>
            <div className="min-w-0 flex-1">
              {m.reasoning ? (
                <details
                  open={streaming && isLast}
                  className="mb-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70"
                >
                  <summary className="cursor-pointer select-none text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    思考过程
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
                    {m.reasoning}
                  </p>
                </details>
              ) : null}
              {m.content ? (
                <Markdown>{m.content}</Markdown>
              ) : streaming && isLast ? (
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
              {(m.usage || m.content) && (
                <div className="mt-2 flex items-center gap-3">
                  {m.usage && (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
                      ↑{m.usage.promptTokens} ↓{m.usage.completionTokens} tokens
                    </span>
                  )}
                  {m.modelUsed && (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
                      模型 {m.modelUsed}
                    </span>
                  )}
                  {m.content && <CopyButton content={m.content} />}
                </div>
              )}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
                  <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                    📚 引用来源
                  </p>
                  <ul className="space-y-0.5">
                    {m.citations.map((c, i) => (
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
      })}
    </div>
  );
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪贴板失败
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-400 opacity-0 transition-all hover:text-orange-600 group-hover:opacity-100 dark:text-zinc-500 dark:hover:text-amber-400"
      title="复制回答"
    >
      <IconCopy width={12} height={12} />
      {copied ? "已复制" : "复制"}
    </button>
  );
}
