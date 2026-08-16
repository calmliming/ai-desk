/** 会话导出（纯函数，可独立测试） */

export interface ExportSession {
  title: string;
  model: string;
  updatedAt: number;
  messages: { role: string; content: string; usage?: { promptTokens: number; completionTokens: number } }[];
}

export function sessionToMarkdown(s: ExportSession): string {
  const lines = [
    `# ${s.title}`,
    "",
    `> 模型：${s.model} · 导出时间：${new Date(s.updatedAt).toLocaleString("zh-CN")}`,
    "",
  ];
  for (const m of s.messages) {
    if (m.role === "user") {
      lines.push("## 👤 用户", "", m.content || "（空）", "");
    } else if (m.role === "assistant") {
      const usage = m.usage
        ? `\n\n*Tokens：↑${m.usage.promptTokens} ↓${m.usage.completionTokens}*`
        : "";
      lines.push("## 🤖 助手", "", m.content || "（空）", usage, "");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function sessionToJson(s: ExportSession): string {
  return JSON.stringify(s, null, 2);
}

/** 触发浏览器下载 */
export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
