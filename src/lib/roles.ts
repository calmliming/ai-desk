/** 对话角色预设（系统提示词） */

export interface RolePreset {
  id: string;
  name: string;
  prompt: string;
}

export const ROLE_PRESETS: RolePreset[] = [
  { id: "none", name: "无预设", prompt: "" },
  {
    id: "assistant",
    name: "通用助手",
    prompt: "你是一个乐于助人的 AI 助手。回答准确、简洁、有条理，必要时分点说明。",
  },
  {
    id: "coder",
    name: "代码专家",
    prompt:
      "你是一位资深软件工程师。回答技术问题时给出可运行的代码示例，说明边界情况与最佳实践，代码使用 Markdown 代码块。",
  },
  {
    id: "writer",
    name: "写作助手",
    prompt: "你是一位资深中文编辑，擅长写作与润色。输出结构清晰、文笔流畅的中文内容。",
  },
  {
    id: "translator",
    name: "翻译专家",
    prompt:
      "你是一位专业翻译，精通中文、英文、日文、韩文等语种。翻译忠实原文、表达自然，只输出译文。",
  },
  {
    id: "concise",
    name: "极简回答",
    prompt: "回答尽可能简短，直接给出结论；除非用户明确要求，不要展开说明。",
  },
];

/** 根据会话存储的 systemPrompt 反查角色（自定义提示词返回 custom） */
export function findRoleByPrompt(prompt: string | undefined): string {
  if (!prompt) return "none";
  return ROLE_PRESETS.find((r) => r.prompt === prompt)?.id ?? "custom";
}

export function roleNameById(id: string): string {
  if (id === "custom") return "自定义";
  return ROLE_PRESETS.find((r) => r.id === id)?.name ?? "自定义";
}
