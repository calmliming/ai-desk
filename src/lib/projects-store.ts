import { useSyncExternalStore } from "react";

/** 项目阶段：开发 → 测试 → 上线 */
export type ProjectStage = "dev" | "test" | "live";

export const STAGE_ORDER: ProjectStage[] = ["dev", "test", "live"];

export const STAGE_META: Record<
  ProjectStage,
  { label: string; emoji: string; badge: string; node: string; line: string }
> = {
  dev: {
    label: "开发中",
    emoji: "🛠",
    badge: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
    node: "bg-amber-500",
    line: "bg-amber-500/70",
  },
  test: {
    label: "测试中",
    emoji: "🧪",
    badge: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
    node: "bg-sky-500",
    line: "bg-sky-500/70",
  },
  live: {
    label: "已上线",
    emoji: "🚀",
    badge: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    node: "bg-emerald-500",
    line: "bg-emerald-500/70",
  },
};

/** 阶段里程碑（进入该阶段的时间点） */
export interface ProjectMilestone {
  stage: ProjectStage;
  time: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  stage: ProjectStage;
  milestones: ProjectMilestone[];
  createdAt: number;
  updatedAt: number;
}

const PROJECTS_KEY = "aidesk.projects.v1";
const SERVER_SNAPSHOT: Project[] = [];

let current: Project[] | null = null;
const listeners = new Set<() => void>();

function load(): Project[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Project[]) : [];
  } catch {
    return [];
  }
}

function getSnapshot(): Project[] {
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

/** 订阅全部项目（localStorage 持久化） */
export function useProjects(): Project[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export function updateProjects(updater: (prev: Project[]) => Project[]): void {
  const next = updater(getSnapshot());
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
    } catch {
      // 忽略存储失败
    }
  }
  listeners.forEach((listener) => listener());
}

export function createProject(name: string, description?: string): Project {
  const now = Date.now();
  const project: Project = {
    id: crypto.randomUUID(),
    name: name || "新项目",
    description,
    stage: "dev",
    milestones: [{ stage: "dev", time: now }],
    createdAt: now,
    updatedAt: now,
  };
  updateProjects((prev) => [project, ...prev]);
  return project;
}

export function deleteProject(id: string): void {
  updateProjects((prev) => prev.filter((p) => p.id !== id));
}

/** 切换阶段并记录里程碑 */
export function setProjectStage(id: string, stage: ProjectStage): void {
  updateProjects((prev) =>
    prev.map((p) => {
      if (p.id !== id || p.stage === stage) return p;
      const next: Project = {
        ...p,
        stage,
        milestones: [...p.milestones, { stage, time: Date.now() }],
        updatedAt: Date.now(),
      };
      return next;
    }),
  );
}

/** 取某项目进入指定阶段的时间（未进入返回 null） */
export function milestoneTime(p: Project, stage: ProjectStage): number | null {
  return p.milestones.find((m) => m.stage === stage)?.time ?? null;
}

/** 阶段历时（天）：进入该阶段到进入下一阶段；当前阶段算到今天 */
export function stageDurationDays(p: Project, stage: ProjectStage): number | null {
  const start = milestoneTime(p, stage);
  if (!start) return null;
  const idx = STAGE_ORDER.indexOf(stage);
  const next =
    idx + 1 < STAGE_ORDER.length ? milestoneTime(p, STAGE_ORDER[idx + 1]) : null;
  const end = next ?? (p.stage === stage ? Date.now() : null);
  if (!end) return null;
  return Math.max(Math.round((end - start) / 86_400_000), 1);
}
