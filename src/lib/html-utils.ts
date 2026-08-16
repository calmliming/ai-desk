/** 从 Markdown 文本中提取可预览的代码块（纯函数，可独立测试） */

/** 提取 ```html / ```htm / ```svg 代码块 */
export function extractPreviewBlocks(markdown: string): string[] {
  const out: string[] = [];
  const re = /```(?:html|htm|svg)\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    const code = match[1].trim();
    if (code) out.push(code);
  }
  return out;
}
