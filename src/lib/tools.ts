/** 文本工具与快捷指令的统一定义：工具页和聊天输入框的 /指令 共用 */

export interface ToolOptionDef {
  id: string;
  label: string;
  default: string;
  choices?: string[];
}

export interface TextTool {
  id: string;
  name: string;
  emoji: string;
  /** 聊天内快捷指令名（不含斜杠） */
  command: string;
  description: string;
  placeholder: string;
  systemPrompt: (options: Record<string, string>) => string;
  options?: ToolOptionDef[];
}

export const TEXT_TOOLS: TextTool[] = [
  {
    id: "translate",
    name: "翻译",
    emoji: "🌐",
    command: "翻译",
    description: "任意语言 → 目标语言，只输出译文",
    placeholder: "粘贴要翻译的文本……",
    options: [
      {
        id: "target",
        label: "目标语言",
        default: "中文",
        choices: [
          "中文",
          "English",
          "日本語",
          "한국어",
          "Français",
          "Deutsch",
          "Español",
          "Русский",
        ],
      },
    ],
    systemPrompt: (o) =>
      `你是一名专业翻译。把用户提供的文本翻译成${o.target ?? "中文"}。要求：忠实原文、表达自然流畅、只输出译文本身，不要任何解释、注释或前后缀。`,
  },
  {
    id: "summarize",
    name: "摘要提炼",
    emoji: "📝",
    command: "总结",
    description: "提炼要点，Markdown 列表输出",
    placeholder: "粘贴长文，获取要点摘要……",
    systemPrompt: () =>
      "你是信息提炼专家。把用户提供的内容提炼为要点摘要：1) 使用 Markdown 无序列表；2) 保留关键数字、结论与专有名词；3) 最多 8 条，每条不超过两行。",
  },
  {
    id: "polish",
    name: "改写润色",
    emoji: "✨",
    command: "改写",
    description: "按指定风格改写文本",
    placeholder: "粘贴要改写的文本……",
    options: [
      {
        id: "style",
        label: "风格",
        default: "更正式",
        choices: ["更正式", "更口语", "更精简", "更生动"],
      },
    ],
    systemPrompt: (o) =>
      `你是资深中文编辑。把用户文本改写得${o.style ?? "更正式"}：保持原意不增删信息、语句通顺自然、只输出改写后的文本本身。`,
  },
  {
    id: "explain",
    name: "代码解释",
    emoji: "💻",
    command: "解释代码",
    description: "逐段讲解代码逻辑与改进点",
    placeholder: "粘贴代码……",
    systemPrompt: () =>
      "你是资深软件工程师。解释用户提供的代码：1) 先用一句话概括整体功能；2) 用 Markdown 小标题分段讲解关键逻辑；3) 指出易错点与改进建议。代码块使用原语言标注。",
  },
];

export function toolDefaultOptions(tool: TextTool): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of tool.options ?? []) out[o.id] = o.default;
  return out;
}

/** 聊天输入框的快捷指令列表 */
export const SLASH_COMMANDS = TEXT_TOOLS.map((tool) => ({ token: tool.command, tool }));

/** 解析消息开头的 /指令；仅当指令后跟有正文时才生效 */
export function parseSlashCommand(text: string): { tool: TextTool | null; content: string } {
  const match = text.match(/^\/([^\s]+)[ \t]*([\s\S]*)$/);
  if (!match) return { tool: null, content: text };
  const tool = TEXT_TOOLS.find((t) => t.command === match[1] || t.id === match[1]);
  if (!tool || !match[2].trim()) return { tool: null, content: text };
  return { tool, content: match[2].trim() };
}

/** 把工具指令与正文组装为一条消息 */
export function buildToolMessage(tool: TextTool, content: string): string {
  return `${tool.systemPrompt(toolDefaultOptions(tool))}\n\n---\n\n${content}`;
}
