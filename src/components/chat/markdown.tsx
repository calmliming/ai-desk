import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";

/**
 * AI 回复的 Markdown 渲染（GFM + 代码高亮）。
 * highlight=false 时跳过语法高亮——流式生成期间用它避免每帧重跑高亮导致闪烁。
 */
export default function Markdown({
  children,
  highlight = true,
}: {
  children: string;
  highlight?: boolean;
}) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={highlight ? [rehypeHighlight] : []}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
