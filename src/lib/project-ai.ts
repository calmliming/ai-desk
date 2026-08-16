import { STAGE_META, STAGE_ORDER, type Project } from "./projects-store";

/** 项目管理 AI 助手：生成开发计划 / 测试用例 / 发布说明 */

export type ProjectAiKind = "plan" | "testcases" | "release" | "report";

export const PROJECT_AI_META: Record<ProjectAiKind, { label: string; emoji: string }> = {
  plan: { label: "开发计划", emoji: "📋" },
  testcases: { label: "测试用例", emoji: "🧪" },
  release: { label: "发布说明", emoji: "🚀" },
  report: { label: "进展报告", emoji: "📊" },
};

const SYSTEM_PROMPTS: Record<ProjectAiKind, string> = {
  plan: "你是资深技术项目经理。基于给定的项目信息，输出一份开发计划：1) 项目目标；2) 里程碑与时间安排；3) 任务分解（Markdown 任务清单，可勾选）；4) 风险与对策。使用 Markdown，中文回答。",
  testcases:
    "你是资深测试工程师。基于给定的项目信息，输出测试用例清单：按模块给出 Markdown 表格（编号/用例/步骤/预期结果），并补充边界条件与异常场景用例。中文回答。",
  release:
    "你是发布经理。基于给定的项目信息，撰写发布说明：版本号建议、新功能/变更、Bug 修复、已知问题、升级注意事项。使用 Markdown，中文回答。",
  report:
    "你是项目助理。阅读给定项目的全部信息与时间线记录，生成一份进展报告：1) 总体进展概述；2) 已完成事项；3) 进行中/待办事项；4) 风险与阻塞；5) 下一步建议。使用 Markdown，中文回答，客观精炼。",
};

/** 组装 AI 生成请求的消息（带项目上下文） */
export function buildProjectAiMessages(
  p: Project,
  kind: ProjectAiKind,
): { role: string; content: string }[] {
  const milestoneText = p.milestones
    .map((m) => `${STAGE_META[m.stage].label}（${new Date(m.time).toLocaleString("zh-CN")}）`)
    .join(" → ");
  const recentLogs = p.logs
    .slice(-10)
    .map((l) => `- [${new Date(l.time).toLocaleString("zh-CN")}] ${l.text.slice(0, 80)}`)
    .join("\n");
  const tasksText = p.tasks
    .map((t) => `- [${t.status === "done" ? "x" : " "}] ${t.title}（${t.priority}）`)
    .join("\n");
  const context = `项目名称：${p.name}
描述：${p.description || "（无）"}
当前阶段：${STAGE_META[p.stage].label}${p.blocked ? "（已标记阻塞）" : ""}
阶段时间线：${milestoneText}
最近记录：
${recentLogs || "（无）"}
任务列表：
${tasksText || "（无）"}`;
  return [
    { role: "system", content: SYSTEM_PROMPTS[kind] },
    { role: "user", content: context },
  ];
}

/** AI 产出存入日志时的文本 */
export function projectAiLogText(kind: ProjectAiKind, content: string): string {
  const meta = PROJECT_AI_META[kind];
  return `${meta.emoji} AI 生成 · ${meta.label}：\n\n${content.slice(0, 2000)}`;
}

/** 导出项目报告（Markdown） */
export function projectReportMarkdown(p: Project): string {
  const lines = [
    `# 项目报告：${p.name}`,
    "",
    `- 当前阶段：${STAGE_META[p.stage].label}${p.blocked ? "（⚠️ 阻塞中）" : ""}${p.archived ? "（已归档）" : ""}`,
    `- 描述：${p.description || "（无）"}`,
    `- 创建时间：${new Date(p.createdAt).toLocaleString("zh-CN")}`,
  ];
  const idx = STAGE_ORDER.indexOf(p.stage);
  const progress = Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
  lines.push(`- 进度：${progress}%`);
  if (p.deadline) {
    lines.push(`- 截止日期：${new Date(p.deadline).toLocaleDateString("zh-CN")}`);
  }
  lines.push("", "## 阶段时间线", "");
  for (const stage of STAGE_ORDER) {
    const t = p.milestones.find((m) => m.stage === stage)?.time;
    lines.push(`- ${STAGE_META[stage].emoji} ${STAGE_META[stage].label}：${t ? new Date(t).toLocaleString("zh-CN") : "未进入"}`);
  }
  lines.push("", "## 记录时间线", "");
  for (const log of p.logs) {
    lines.push(`- [${new Date(log.time).toLocaleString("zh-CN")}] ${log.text.split("\n")[0].slice(0, 120)}`);
  }
  lines.push("", `> 由 AIDesk 项目管理生成于 ${new Date().toLocaleString("zh-CN")}`);
  return lines.join("\n");
}
