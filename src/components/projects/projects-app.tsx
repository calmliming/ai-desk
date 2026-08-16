"use client";

import { Fragment, useState } from "react";
import { logActivity } from "@/lib/activity-store";
import {
  addProjectLog,
  createProject,
  deleteProject,
  milestoneTime,
  setProjectStage,
  stageDurationDays,
  STAGE_META,
  STAGE_ORDER,
  updateProjects,
  useProjects,
  type Project,
  type ProjectStage,
} from "@/lib/projects-store";
import { IconArrowLeft, IconArrowRight, IconFolder, IconPlus, IconTrash } from "../icons";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-950/60";

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export default function ProjectsApp() {
  const projects = useProjects();
  const [filter, setFilter] = useState<ProjectStage | "all">("all");

  const counts = {
    all: projects.length,
    dev: projects.filter((p) => p.stage === "dev").length,
    test: projects.filter((p) => p.stage === "test").length,
    live: projects.filter((p) => p.stage === "live").length,
  };

  const filtered = projects.filter((p) => filter === "all" || p.stage === filter);

  const handleNew = () => {
    const p = createProject("新项目", "");
    logActivity("project", "新建项目", p.name);
  };

  const handleDelete = (p: Project) => {
    if (!window.confirm(`确定删除项目「${p.name}」？`)) return;
    deleteProject(p.id);
    logActivity("project", "删除项目", p.name);
  };

  const handleStage = (p: Project, stage: ProjectStage) => {
    setProjectStage(p.id, stage);
    logActivity(
      "project",
      `阶段流转：${STAGE_META[p.stage].label} → ${STAGE_META[stage].label}`,
      p.name,
    );
  };

  return (
    <div className="space-y-5">
      {/* 头部 */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">项目管理</h1>
          <p className="mt-1.5 text-zinc-600 dark:text-zinc-400">
            以时间线跟踪每个项目的生命周期：开发 → 测试 → 上线。
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          <IconPlus width={15} height={15} />
          新建项目
        </button>
      </header>

      {/* 阶段统计 + 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "all", label: `全部 ${counts.all}` },
            { id: "dev", label: `🛠 开发中 ${counts.dev}` },
            { id: "test", label: `🧪 测试中 ${counts.test}` },
            { id: "live", label: `🚀 已上线 ${counts.live}` },
          ] as { id: ProjectStage | "all"; label: string }[]
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-orange-600 text-white shadow-sm"
                : "border border-zinc-300 text-zinc-600 hover:border-amber-500/60 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 项目时间线 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-orange-600 dark:text-amber-400">
            <IconFolder width={26} height={26} />
          </span>
          <p className="font-medium text-zinc-600 dark:text-zinc-300">
            {projects.length === 0 ? "还没有项目，点击右上角新建" : "该阶段暂无项目"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onDelete={handleDelete} onStage={handleStage} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project: p,
  onDelete,
  onStage,
}: {
  project: Project;
  onDelete: (p: Project) => void;
  onStage: (p: Project, stage: ProjectStage) => void;
}) {
  const meta = STAGE_META[p.stage];
  const stageIdx = STAGE_ORDER.indexOf(p.stage);
  const [showLogs, setShowLogs] = useState(false);
  const [logText, setLogText] = useState("");

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-lg">
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={p.name}
            onChange={(e) =>
              updateProjects((prev) =>
                prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value, updatedAt: Date.now() } : x)),
              )
            }
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold outline-none transition-colors focus:border-amber-500/50 dark:bg-transparent"
            placeholder="项目名称"
          />
          <input
            type="text"
            value={p.description ?? ""}
            onChange={(e) =>
              updateProjects((prev) =>
                prev.map((x) =>
                  x.id === p.id ? { ...x, description: e.target.value, updatedAt: Date.now() } : x,
                ),
              )
            }
            className={`${inputCls} mt-1 !py-1.5 text-xs`}
            placeholder="补充描述（可选）…"
          />
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
          {meta.label}
        </span>
        <button
          type="button"
          onClick={() => onDelete(p)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
          title="删除项目"
        >
          <IconTrash width={14} height={14} />
        </button>
      </div>

      {/* 时间线：开发 → 测试 → 上线 */}
      <div className="mt-5 px-2">
        <div className="flex items-start">
          {STAGE_ORDER.map((stage, i) => {
            const sMeta = STAGE_META[stage];
            const time = milestoneTime(p, stage);
            const reached = i <= stageIdx;
            const isCurrent = i === stageIdx;
            return (
              <Fragment key={stage}>
                {i > 0 && (
                  <div className="mx-1 mt-2.5 h-0.5 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        i <= stageIdx ? sMeta.line : "w-0"
                      }`}
                    />
                  </div>
                )}
                <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-white ${
                      reached ? sMeta.node : "bg-zinc-300 dark:bg-zinc-700"
                    } ${isCurrent ? "ring-4 ring-amber-500/20" : ""}`}
                  >
                    {reached ? "✓" : i + 1}
                  </span>
                  <span
                    className={`text-xs ${
                      isCurrent ? "font-medium text-zinc-800 dark:text-zinc-100" : "text-zinc-400"
                    }`}
                  >
                    {sMeta.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-600">
                    {formatDate(time)}
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* 阶段历时 + 操作 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
          当前阶段已 {stageDurationDays(p, p.stage) ?? 1} 天
        </span>
        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            showLogs
              ? "border-amber-500/50 text-orange-600 dark:text-amber-400"
              : "border-zinc-300 text-zinc-600 hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          }`}
          title="查看/添加时间节点记录"
        >
          🕐 时间线（{p.logs.length}）
        </button>
        <span className="ml-auto flex items-center gap-1.5">
          {stageIdx > 0 && (
            <button
              type="button"
              onClick={() => onStage(p, STAGE_ORDER[stageIdx - 1])}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
              title="退回上一阶段"
            >
              <IconArrowLeft width={12} height={12} />
              {stageIdx > 1 ? STAGE_META[STAGE_ORDER[stageIdx - 1]].label : "退回"}
            </button>
          )}
          {stageIdx < STAGE_ORDER.length - 1 ? (
            <button
              type="button"
              onClick={() => onStage(p, STAGE_ORDER[stageIdx + 1])}
              className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500"
            >
              进入{STAGE_META[STAGE_ORDER[stageIdx + 1]].label}
              <IconArrowRight width={12} height={12} />
            </button>
          ) : (
            <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              🎉 项目已上线
            </span>
          )}
        </span>
      </div>

      {/* 日志时间线（每次记录的时间节点） */}
      {showLogs && (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
          <div className="relative max-h-56 space-y-3 overflow-y-auto pl-1">
            <span className="absolute bottom-1 left-[5px] top-1 w-px bg-zinc-200 dark:bg-zinc-700" />
            {p.logs.map((log) => (
              <div key={log.id} className="relative flex gap-3">
                <span
                  className={`z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-zinc-50 dark:ring-zinc-950/40 ${
                    log.kind === "stage"
                      ? "bg-sky-500"
                      : log.kind === "note"
                        ? "bg-orange-500"
                        : "bg-amber-500"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
                    {log.text}
                  </p>
                  <p className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-600">
                    {formatDateTime(log.time)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = logText.trim();
              if (!text) return;
              addProjectLog(p.id, text);
              logActivity("project", "添加项目记录", `${p.name} · ${text.slice(0, 40)}`);
              setLogText("");
            }}
          >
            <input
              type="text"
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              placeholder="添加一条记录，如：修复了登录 bug…"
              className={`${inputCls} !py-1.5 text-xs`}
            />
            <button
              type="submit"
              disabled={!logText.trim()}
              className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              记录
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
