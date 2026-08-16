import { useSyncExternalStore } from "react";

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

const PROMPTS_KEY = "aidesk.prompts.v1";
const SERVER_SNAPSHOT: PromptTemplate[] = [];

/** 内置精选模板（首次使用时作为初始数据） */
function seedBuiltins(): PromptTemplate[] {
  const now = Date.now();
  const defs: Array<Pick<PromptTemplate, "title" | "content">> = [
    {
      title: "文章润色",
      content:
        "请帮我润色以下文本，使其表达更清晰、流畅、专业，保持原意不变：\n\n{{文本}}",
    },
    {
      title: "会议纪要",
      content:
        "请根据以下会议记录，整理出结构化会议纪要，包含：会议主题、讨论要点、决议事项、待办事项（含负责人）：\n\n{{记录}}",
    },
    {
      title: "周报生成",
      content:
        "根据以下工作要点，生成一份简洁的周报，包含本周完成、下周计划、风险与求助三个部分：\n\n{{要点}}",
    },
    {
      title: "深度翻译",
      content:
        "将以下内容翻译成{{目标语言}}，保持专业术语准确、行文自然，只输出译文：\n\n{{内容}}",
    },
    {
      title: "代码审查",
      content:
        "请审查以下代码，指出潜在 bug、性能问题与可读性改进，按严重程度排序：\n\n```\n{{代码}}\n```",
    },
    {
      title: "产品起名",
      content:
        "为一个{{类型}}产品起 10 个候选名字，要求：{{要求}}。逐个解释名字的含义与记忆点。",
    },
    {
      title: "小红书文案",
      content:
        "为以下主题写一篇小红书笔记：标题有吸引力，正文口语化、分段清晰、适当使用 emoji，结尾附 3-5 个话题标签。\n\n主题：{{主题}}",
    },
  ];
  return defs.map((d, i) => ({
    ...d,
    id: `builtin-${i + 1}`,
    builtin: true,
    createdAt: now,
    updatedAt: now,
  }));
}

let current: PromptTemplate[] | null = null;
const listeners = new Set<() => void>();

function load(): PromptTemplate[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(PROMPTS_KEY);
    if (!raw) return seedBuiltins();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedBuiltins();
    return parsed as PromptTemplate[];
  } catch {
    return seedBuiltins();
  }
}

function getSnapshot(): PromptTemplate[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (current === null) current = load();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 订阅提示词库（localStorage 持久化） */
export function usePrompts(): PromptTemplate[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function updatePrompts(updater: (prev: PromptTemplate[]) => PromptTemplate[]): void {
  const next = updater(getSnapshot());
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PROMPTS_KEY, JSON.stringify(next));
    } catch {
      // 忽略存储失败
    }
  }
  listeners.forEach((listener) => listener());
}
