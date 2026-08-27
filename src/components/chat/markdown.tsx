"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
import { useIsDark } from "@/lib/theme";
import "highlight.js/styles/github-dark.css";

/**
 * AI 回复的 Markdown 渲染（GFM + 代码高亮 + Mermaid 图表）。
 *
 * 闪屏处理：流式生成期间，最后一个未闭合的 ``` 代码块内容仍在变化，
 * 每帧重跑高亮会让 token 颜色来回跳动；改为「fence 闭合后才高亮」，
 * 之前已闭合的代码块则始终高亮，避免生成结束时整条消息突然变色的闪烁。
 */

/**
 * 扫描围栏代码块：围栏标记为奇数个 → 最后一个块未闭合，
 * 其内容即最后一个围栏标记行之后的所有文本。
 */
function scanFences(md: string): { openBlockText: string | null } {
  const re = /^(`{3,}|~{3,})/gm;
  let count = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    count += 1;
    last = m;
  }
  if (count % 2 === 0 || !last) return { openBlockText: null };
  const lineEnd = md.indexOf("\n", last.index);
  const tail = lineEnd === -1 ? "" : md.slice(lineEnd + 1);
  return { openBlockText: tail.replace(/\n$/, "") };
}

/** 高亮结果缓存：已闭合代码块的内容不变，避免流式期间反复重跑 */
const highlightCache = new Map<string, string>();
const HIGHLIGHT_CACHE_LIMIT = 64;

function highlightCode(code: string, lang?: string): string {
  const key = `${lang ?? ""}\u0000${code}`;
  const hit = highlightCache.get(key);
  if (hit !== undefined) return hit;
  const result =
    lang && hljs.getLanguage(lang)
      ? hljs.highlight(code, { language: lang, ignoreIllegals: true })
      : hljs.highlightAuto(code);
  if (highlightCache.size >= HIGHLIGHT_CACHE_LIMIT) highlightCache.clear();
  highlightCache.set(key, result.value);
  return result.value;
}

/* ------------------------------ 代码块复制 ------------------------------ */

function CodeCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
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
      title="复制代码"
      className="absolute right-2 top-2 z-10 rounded-md border border-zinc-600/30 bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-200 opacity-0 backdrop-blur transition-all hover:bg-zinc-700 group-hover/code:opacity-100"
    >
      {copied ? "✓ 已复制" : "复制"}
    </button>
  );
}

/* ---------------------------- Mermaid 图表渲染 ---------------------------- */

let mermaidModule: Promise<{ default: typeof import("mermaid").default }> | null = null;
let mermaidInitTheme: string | null = null;

async function loadMermaid(theme: string) {
  mermaidModule ??= import("mermaid");
  const mod = await mermaidModule;
  if (mermaidInitTheme !== theme) {
    mod.default.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "neutral",
      securityLevel: "strict",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
    });
    mermaidInitTheme = theme;
  }
  return mod.default;
}

/** 懒加载 mermaid，渲染 ```mermaid 代码块；失败时回退显示源码 */
function MermaidBlock({ code }: { code: string }) {
  const dark = useIsDark();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = await loadMermaid(dark ? "dark" : "light");
        const id = `aidesk-mmd-${Math.random().toString(36).slice(2, 10)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        // v11 渲染时会建一个 id 为 d<id> 的临时节点，需手动清理
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, dark]);

  if (failed) {
    return (
      <pre className="mt-0">
        <code>{code}</code>
      </pre>
    );
  }
  if (!svg) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-xs text-zinc-400 dark:text-zinc-500">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-amber-500 dark:border-zinc-700" />
        图表渲染中…
      </div>
    );
  }
  return <div className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* -------------------------------- 主组件 -------------------------------- */

export default function Markdown({ children }: { children: string }) {
  const { openBlockText } = scanFences(children);

  const components: Components = {
    pre({ children: preChildren }) {
      const codeEl = preChildren as ReactElement<{
        className?: string;
        children?: ReactNode;
      }> | null;
      const className =
        codeEl && typeof codeEl.props.className === "string" ? codeEl.props.className : "";
      const raw = codeEl ? String(codeEl.props.children ?? "").replace(/\n$/, "") : "";
      // 未闭合的最后一个代码块：先按纯文本渲染（CSS 已保证文字近白色）
      const isOpenBlock = openBlockText !== null && raw === openBlockText;
      const lang = /language-([\w+#-]+)/.exec(className)?.[1];

      return (
        <div className="group/code relative">
          {raw && <CodeCopyButton text={raw} />}
          {lang === "mermaid" && !isOpenBlock ? (
            <MermaidBlock code={raw} />
          ) : isOpenBlock || !raw ? (
            <pre>{preChildren}</pre>
          ) : (
            <pre>
              <code
                className={`hljs ${className}`.trim()}
                dangerouslySetInnerHTML={{ __html: highlightCode(raw, lang) }}
              />
            </pre>
          )}
        </div>
      );
    },
  };

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
