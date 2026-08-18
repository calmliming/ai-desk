import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { Citation } from "@/lib/types";
import type { LinkedItem, ProjectMilestone } from "@/lib/projects-store";

/**
 * 表结构与 src/lib 下各 store 的 TS 接口一一对应。
 * 三条约定：
 * - 时间戳沿用前端的毫秒数（bigint + mode:"number"），不转 timestamp，避免读写两头转换。
 * - 数组顺序由 position 列保证：前端的 store 是有序数组，靠 createdAt 排序不可靠
 *   （会话会被置顶、日志可改时间），显式存下标才能原样往返。
 * - 枚举列一律再加一条 CHECK：text({ enum }) 只是 TS 层约束，不落到数据库，
 *   非法值能直接写进去，而前端拿 meta 表反查时会取到 undefined 然后崩。
 */

const ROLES = ["system", "user", "assistant"] as const;
const STAGES = ["dev", "test", "live"] as const;
const LOG_KINDS = ["created", "stage", "note", "ai"] as const;
const TASK_STATUSES = ["todo", "doing", "done"] as const;
const TASK_PRIORITIES = ["low", "medium", "high"] as const;
const ACTIVITY_TYPES = [
  "chat",
  "tool",
  "compare",
  "prompt",
  "settings",
  "file",
  "session",
  "project",
] as const;

/** 取值都是代码里写死的 ASCII 常量，直接拼进 SQL 没有注入面 */
function oneOf(name: string, column: AnyPgColumn, values: readonly string[]) {
  const list = values.map((v) => `'${v}'`).join(", ");
  return check(name, sql.raw(`"${column.name}" in (${list})`));
}

export const sessions = pgTable("sessions", {
  id: text().primaryKey(),
  title: text().notNull(),
  providerId: text("provider_id").notNull(),
  model: text().notNull(),
  systemPrompt: text("system_prompt"),
  temperature: real(),
  maxTokens: integer("max_tokens"),
  search: boolean(),
  thinking: boolean(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  position: integer().notNull(),
});

export const messages = pgTable(
  "messages",
  {
    id: text().primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text({ enum: ROLES }).notNull(),
    content: text().notNull(),
    /** 推理过程（DeepSeek-R1 / reasoner 的 reasoning_content） */
    reasoning: text(),
    /** 图片附件；目前是 base64 data URL，体积大时应改存对象存储只留路径 */
    images: jsonb().$type<string[]>(),
    usage: jsonb().$type<{ promptTokens: number; completionTokens: number }>(),
    citations: jsonb().$type<Citation[]>(),
    modelUsed: text("model_used"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    position: integer().notNull(),
  },
  (t) => [
    index("messages_session_idx").on(t.sessionId, t.position),
    oneOf("messages_role_check", t.role, ROLES),
  ],
);

export const prompts = pgTable("prompts", {
  id: text().primaryKey(),
  title: text().notNull(),
  content: text().notNull(),
  builtin: boolean(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  position: integer().notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    description: text(),
    stage: text({ enum: STAGES }).notNull(),
    /** 阶段里程碑：条数固定且总是整体读写，留在 jsonb 里 */
    milestones: jsonb().$type<ProjectMilestone[]>().notNull(),
    archived: boolean(),
    blocked: boolean(),
    deadline: bigint({ mode: "number" }),
    linkedSessions: jsonb("linked_sessions").$type<LinkedItem[]>(),
    linkedPrompts: jsonb("linked_prompts").$type<LinkedItem[]>(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    position: integer().notNull(),
  },
  (t) => [oneOf("projects_stage_check", t.stage, STAGES)],
);

export const projectLogs = pgTable(
  "project_logs",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    time: bigint({ mode: "number" }).notNull(),
    kind: text({ enum: LOG_KINDS }).notNull(),
    text: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [
    index("project_logs_project_idx").on(t.projectId, t.position),
    oneOf("project_logs_kind_check", t.kind, LOG_KINDS),
  ],
);

export const projectTasks = pgTable(
  "project_tasks",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    status: text({ enum: TASK_STATUSES }).notNull(),
    priority: text({ enum: TASK_PRIORITIES }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    position: integer().notNull(),
  },
  (t) => [
    index("project_tasks_project_idx").on(t.projectId, t.position),
    oneOf("project_tasks_status_check", t.status, TASK_STATUSES),
    oneOf("project_tasks_priority_check", t.priority, TASK_PRIORITIES),
  ],
);

export const activity = pgTable(
  "activity",
  {
    id: text().primaryKey(),
    type: text({ enum: ACTIVITY_TYPES }).notNull(),
    title: text().notNull(),
    detail: text(),
    time: bigint({ mode: "number" }).notNull(),
    position: integer().notNull(),
  },
  (t) => [
    index("activity_time_idx").on(t.time),
    oneOf("activity_type_check", t.type, ACTIVITY_TYPES),
  ],
);

/** 一次性标记位，目前只用来记录「内置提示词已初始化」，避免删空后被重新种入 */
export const appMeta = pgTable("app_meta", {
  key: text().primaryKey(),
  value: text().notNull(),
});

/** 对比槽位是一条最多 6 项的有序列表，position 本身就够当主键 */
export const compareSlots = pgTable("compare_slots", {
  position: integer().primaryKey(),
  providerId: text("provider_id").notNull(),
  model: text().notNull(),
});
