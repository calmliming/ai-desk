import { asc, eq, getTableColumns, notInArray, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { PgTransaction } from "drizzle-orm/pg-core";

import { db } from "./client";
import {
  activity,
  appMeta,
  compareSlots,
  messages,
  projectLogs,
  projectTasks,
  projects,
  prompts,
  sessions,
} from "./schema";
import { builtinPrompts } from "@/lib/prompt-builtins";
import type { ActivityEntry } from "@/lib/activity-store";
import type { CompareSlot } from "@/lib/compare-store";
import type { Project } from "@/lib/projects-store";
import type { PromptTemplate } from "@/lib/prompts-store";
import type { Session } from "@/lib/sessions-store";
import type { ChatMessage } from "@/lib/types";

/**
 * 客户端持有权威状态，每次持久化把整份集合 PUT 上来，这里落成关系表。
 * 写入策略：同一事务内「删掉不在本次载荷里的行 + 其余按主键 upsert」，
 * 而不是清空重插——避免每发一条消息就重写整张 messages 表。
 */

type Tx = PgTransaction<never, never, never>;

/** Postgres 单条语句最多 65535 个绑定参数，按行数分批留足余量 */
const CHUNK = 500;

/**
 * 由表定义推导 upsert 的 SET 子句（主键除外），
 * 这样加列时不用记得来这里补一笔，漏了会变成静默不更新。
 */
function excludedSet(table: PgTable, pk: string) {
  const cols = getTableColumns(table);
  return Object.fromEntries(
    Object.keys(cols)
      .filter((key) => key !== pk)
      .map((key) => [key, sql.raw(`excluded."${cols[key].name}"`)]),
  );
}

async function upsertAll<T extends PgTable>(
  tx: Tx,
  table: T,
  pk: keyof T & string,
  rows: Record<string, unknown>[],
) {
  const target = (table as Record<string, unknown>)[pk];
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx
      .insert(table)
      .values(rows.slice(i, i + CHUNK) as never)
      // set 的键由运行时反射得到，泛型 T 下无法静态对上 PgUpdateSetSource，这里断言收口
      .onConflictDoUpdate({ target: target as never, set: excludedSet(table, pk) as never });
  }
}

/** 删掉本次载荷里不存在的行；载荷为空时清表（notInArray 不接受空数组） */
async function prune<T extends PgTable>(tx: Tx, table: T, pk: keyof T & string, keep: (string | number)[]) {
  const col = (table as Record<string, unknown>)[pk];
  if (keep.length === 0) await tx.delete(table);
  else await tx.delete(table).where(notInArray(col as never, keep));
}

/* ---------------------------------- 会话 ---------------------------------- */

export async function readSessions(): Promise<Session[]> {
  const [sessionRows, messageRows] = await Promise.all([
    db.select().from(sessions).orderBy(asc(sessions.position)),
    db.select().from(messages).orderBy(asc(messages.position)),
  ]);

  const bySession = new Map<string, ChatMessage[]>();
  for (const m of messageRows) {
    const list = bySession.get(m.sessionId) ?? [];
    list.push({
      id: m.id,
      role: m.role,
      content: m.content,
      ...(m.reasoning !== null && { reasoning: m.reasoning }),
      ...(m.images && { images: m.images }),
      ...(m.usage && { usage: m.usage }),
      ...(m.citations && { citations: m.citations }),
      ...(m.modelUsed !== null && { modelUsed: m.modelUsed }),
      ...(m.toolCalls && { toolCalls: m.toolCalls }),
      createdAt: m.createdAt,
    });
    bySession.set(m.sessionId, list);
  }

  return sessionRows.map((s) => ({
    id: s.id,
    title: s.title,
    providerId: s.providerId,
    model: s.model,
    messages: bySession.get(s.id) ?? [],
    ...(s.systemPrompt !== null && { systemPrompt: s.systemPrompt }),
    ...(s.temperature !== null && { temperature: s.temperature }),
    ...(s.maxTokens !== null && { maxTokens: s.maxTokens }),
    ...(s.search !== null && { search: s.search }),
    ...(s.thinking !== null && { thinking: s.thinking }),
    ...(s.tools !== null && { tools: s.tools }),
    ...(s.pinned !== null && { pinned: s.pinned }),
    ...(s.favorite !== null && { favorite: s.favorite }),
    ...(s.groupName !== null && { group: s.groupName }),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

export async function writeSessions(data: Session[]): Promise<void> {
  const sessionRows = data.map((s, position) => ({
    id: s.id,
    title: s.title,
    providerId: s.providerId,
    model: s.model,
    systemPrompt: s.systemPrompt ?? null,
    temperature: s.temperature ?? null,
    maxTokens: s.maxTokens ?? null,
    search: s.search ?? null,
    thinking: s.thinking ?? null,
    tools: s.tools ?? null,
    pinned: s.pinned ?? false,
    favorite: s.favorite ?? false,
    groupName: s.group ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    position,
  }));

  const messageRows = data.flatMap((s) =>
    (s.messages ?? []).map((m, position) => ({
      id: m.id,
      sessionId: s.id,
      role: m.role,
      content: m.content,
      reasoning: m.reasoning ?? null,
      images: m.images ?? null,
      usage: m.usage ?? null,
      citations: m.citations ?? null,
      modelUsed: m.modelUsed ?? null,
      toolCalls: m.toolCalls ?? null,
      createdAt: m.createdAt,
      position,
    })),
  );

  await db.transaction(async (tx) => {
    // 先删会话：外键 cascade 会带走其下消息，剩下的按 id 精修
    await prune(tx as Tx, sessions, "id", sessionRows.map((r) => r.id));
    await upsertAll(tx as Tx, sessions, "id", sessionRows);
    await prune(tx as Tx, messages, "id", messageRows.map((r) => r.id));
    await upsertAll(tx as Tx, messages, "id", messageRows);
  });
}

/* --------------------------------- 提示词 --------------------------------- */

const PROMPTS_SEEDED = "prompts_seeded";

/** 首次读取时种入内置模板；靠 app_meta 标记而非「表是否为空」，删空后不会复活 */
async function seedPromptsOnce(): Promise<void> {
  const [marker] = await db.select().from(appMeta).where(eq(appMeta.key, PROMPTS_SEEDED));
  if (marker) return;

  await db.transaction(async (tx) => {
    await tx.insert(appMeta).values({ key: PROMPTS_SEEDED, value: "1" }).onConflictDoNothing();
    await tx
      .insert(prompts)
      .values(
        builtinPrompts(Date.now()).map((p, position) => ({
          id: p.id,
          title: p.title,
          content: p.content,
          builtin: true,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          position,
        })),
      )
      .onConflictDoNothing();
  });
}

export async function readPrompts(): Promise<PromptTemplate[]> {
  await seedPromptsOnce();
  const rows = await db.select().from(prompts).orderBy(asc(prompts.position));
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    ...(p.builtin !== null && { builtin: p.builtin }),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

export async function writePrompts(data: PromptTemplate[]): Promise<void> {
  const rows = data.map((p, position) => ({
    id: p.id,
    title: p.title,
    content: p.content,
    builtin: p.builtin ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    position,
  }));
  await db.transaction(async (tx) => {
    await prune(tx as Tx, prompts, "id", rows.map((r) => r.id));
    await upsertAll(tx as Tx, prompts, "id", rows);
  });
}

/* ---------------------------------- 项目 ---------------------------------- */

export async function readProjects(): Promise<Project[]> {
  const [projectRows, logRows, taskRows] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.position)),
    db.select().from(projectLogs).orderBy(asc(projectLogs.position)),
    db.select().from(projectTasks).orderBy(asc(projectTasks.position)),
  ]);

  const logsBy = new Map<string, Project["logs"]>();
  for (const l of logRows) {
    const list = logsBy.get(l.projectId) ?? [];
    list.push({ id: l.id, time: l.time, kind: l.kind, text: l.text });
    logsBy.set(l.projectId, list);
  }

  const tasksBy = new Map<string, Project["tasks"]>();
  for (const t of taskRows) {
    const list = tasksBy.get(t.projectId) ?? [];
    list.push({ id: t.id, title: t.title, status: t.status, priority: t.priority, createdAt: t.createdAt });
    tasksBy.set(t.projectId, list);
  }

  return projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    ...(p.description !== null && { description: p.description }),
    stage: p.stage,
    milestones: p.milestones,
    logs: logsBy.get(p.id) ?? [],
    tasks: tasksBy.get(p.id) ?? [],
    ...(p.archived !== null && { archived: p.archived }),
    ...(p.blocked !== null && { blocked: p.blocked }),
    ...(p.deadline !== null && { deadline: p.deadline }),
    ...(p.linkedSessions && { linkedSessions: p.linkedSessions }),
    ...(p.linkedPrompts && { linkedPrompts: p.linkedPrompts }),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

export async function writeProjects(data: Project[]): Promise<void> {
  const projectRows = data.map((p, position) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    stage: p.stage,
    milestones: p.milestones,
    archived: p.archived ?? null,
    blocked: p.blocked ?? null,
    deadline: p.deadline ?? null,
    linkedSessions: p.linkedSessions ?? null,
    linkedPrompts: p.linkedPrompts ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    position,
  }));

  const logRows = data.flatMap((p) =>
    (p.logs ?? []).map((l, position) => ({
      id: l.id,
      projectId: p.id,
      time: l.time,
      kind: l.kind,
      text: l.text,
      position,
    })),
  );

  const taskRows = data.flatMap((p) =>
    (p.tasks ?? []).map((t, position) => ({
      id: t.id,
      projectId: p.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      position,
    })),
  );

  await db.transaction(async (tx) => {
    await prune(tx as Tx, projects, "id", projectRows.map((r) => r.id));
    await upsertAll(tx as Tx, projects, "id", projectRows);
    await prune(tx as Tx, projectLogs, "id", logRows.map((r) => r.id));
    await upsertAll(tx as Tx, projectLogs, "id", logRows);
    await prune(tx as Tx, projectTasks, "id", taskRows.map((r) => r.id));
    await upsertAll(tx as Tx, projectTasks, "id", taskRows);
  });
}

/* -------------------------------- 操作记录 -------------------------------- */

export async function readActivity(): Promise<ActivityEntry[]> {
  const rows = await db.select().from(activity).orderBy(asc(activity.position));
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    ...(a.detail !== null && { detail: a.detail }),
    time: a.time,
  }));
}

export async function writeActivity(data: ActivityEntry[]): Promise<void> {
  const rows = data.map((a, position) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    detail: a.detail ?? null,
    time: a.time,
    position,
  }));
  await db.transaction(async (tx) => {
    await prune(tx as Tx, activity, "id", rows.map((r) => r.id));
    await upsertAll(tx as Tx, activity, "id", rows);
  });
}

/* -------------------------------- 对比槽位 -------------------------------- */

export async function readCompareSlots(): Promise<CompareSlot[]> {
  const rows = await db.select().from(compareSlots).orderBy(asc(compareSlots.position));
  return rows.map((s) => ({ providerId: s.providerId, model: s.model }));
}

export async function writeCompareSlots(data: CompareSlot[]): Promise<void> {
  const rows = data.map((s, position) => ({ position, providerId: s.providerId, model: s.model }));
  await db.transaction(async (tx) => {
    await prune(tx as Tx, compareSlots, "position", rows.map((r) => r.position));
    await upsertAll(tx as Tx, compareSlots, "position", rows);
  });
}
