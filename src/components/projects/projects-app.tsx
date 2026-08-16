"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logActivity } from "@/lib/activity-store";
import { streamChat } from "@/lib/chat-client";
import { usePrompts } from "@/lib/prompts-store";
import {
  addProjectLog,
  createProject,
  deleteProject,
  linkProjectPrompt,
  linkProjectSession,
  milestoneTime,
  projectProgress,
  projectsStats,
  setProjectDeadline,
  setProjectStage,
  stageDurationDays,
  STAGE_META,
  STAGE_ORDER,
  toggleProjectArchived,
  toggleProjectBlocked,
  unlinkProjectPrompt,
  unlinkProjectSession,
  updateProjects,
  useProjects,
  type Project,
  type ProjectStage,
} from "@/lib/projects-store";
import {
  buildProjectAiMessages,
  PROJECT_AI_META,
  projectAiLogText,
  projectReportMarkdown,
  type ProjectAiKind,
} from "@/lib/project-ai";
import { downloadText } from "@/lib/session-export";
import { useSessions } from "@/lib/sessions-store";
import { useAppSettings } from "@/lib/settings-store";
import { fillTemplate } from "@/lib/template-utils";
import { setTransfer } from "@/lib/transfer";
import { confirmDialog } from "@/lib/confirm-store";
import { toast } from "@/lib/toast-store";
import Select from "@/components/ui/select";
import {
  IconArrowLeft,
  IconArrowRight,
  IconDownload,
  IconFolder,
  IconPlus,
  IconTrash,
  IconX,
} from "../icons";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-950/60";

const DAY = 86_400_000;

/** 时间戳（模块级封装，避免 lint 将 Date.now 视为渲染期不纯调用） */
function now(): number {
  return Date.now();
}

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

type ViewMode = "timeline" | "board";
type SortMode = "updated" | "stage" | "created";

export default function ProjectsApp() {
  const projects = useProjects();
  const [view, setView] = useState<ViewMode>("timeline");
  const [filter, setFilter] = useState<ProjectStage | "all">("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ProjectStage | null>(null);

  const stats = projectsStats(projects);

  const counts = {
    all: projects.filter((p) => !p.archived).length,
    dev: projects.filter((p) => p.stage === "dev" && !p.archived).length,
    test: projects.filter((p) => p.stage === "test" && !p.archived).length,
    live: projects.filter((p) => p.stage === "live" && !p.archived).length,
  };

  const visible = projects
    .filter(
      (p) =>
        (showArchived || !p.archived) &&
        (filter === "all" || p.stage === filter) &&
        (!query.trim() ||
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          (p.description ?? "").toLowerCase().includes(query.toLowerCase())),
    )
    .sort((a, b) => {
      if (sortBy === "updated") return b.updatedAt - a.updatedAt;
      if (sortBy === "created") return b.createdAt - a.createdAt;
      return (
        STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) ||
        b.updatedAt - a.updatedAt
      );
    });

  const effectiveId = selectedId ?? visible[0]?.id ?? null;
  const selected = projects.find((p) => p.id === effectiveId) ?? null;

  const handleNew = () => {
    const p = createProject("新项目", "");
    setSelectedId(p.id);
    logActivity("project", "新建项目", p.name);
  };

  const handleDelete = async (p: Project) => {
    const ok = await confirmDialog({
      message: `确定删除项目「${p.name}」？`,
      detail: "项目及其全部时间线记录将被删除，不可恢复。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    deleteProject(p.id);
    if (selectedId === p.id) setSelectedId(null);
    logActivity("project", "删除项目", p.name);
    toast.success(`已删除「${p.name}」`);
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
            时间线跟踪项目生命周期，AI 助手生成计划与用例，看板拖拽流转阶段。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
            {(
              [
                { id: "timeline", label: "时间线" },
                { id: "board", label: "看板" },
              ] as { id: ViewMode; label: string }[]
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v.id
                    ? "bg-orange-600 text-white"
                    : "text-zinc-600 hover:text-orange-600 dark:text-zinc-300"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            <IconPlus width={15} height={15} />
            新建项目
          </button>
        </div>
      </header>

      {/* 流程统计 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "项目总数", value: stats.total, hint: `归档 ${stats.archived}` },
          { label: "进行中", value: stats.active, hint: `阻塞 ${stats.blocked}` },
          { label: "已上线", value: stats.live, hint: "完成交付" },
          {
            label: "平均开发周期",
            value: stats.avgDevDays !== null ? `${stats.avgDevDays} 天` : "—",
            hint: "开发→测试",
          },
          {
            label: "平均测试周期",
            value: stats.avgTestDays !== null ? `${stats.avgTestDays} 天` : "—",
            hint: "测试→上线",
          },
          {
            label: "平均全周期",
            value: stats.avgCycleDays !== null ? `${stats.avgCycleDays} 天` : "—",
            hint: "开发→上线",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none"
          >
            <p className="text-xl font-semibold tabular-nums tracking-tight text-orange-600 dark:text-amber-400">
              {s.value}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{s.label}</p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* 搜索 / 排序 / 阶段筛选 / 归档 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索项目…"
          className={`${inputCls} !w-52`}
        />
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortMode)} title="排序">
          <option value="updated">最近更新</option>
          <option value="stage">按阶段</option>
          <option value="created">创建时间</option>
        </Select>
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
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
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-orange-600 text-white shadow-sm"
                : "border border-zinc-300 text-zinc-600 hover:border-amber-500/60 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={`ml-auto rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            showArchived
              ? "bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900"
              : "border border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
          }`}
          title="显示/隐藏已归档项目"
        >
          🗄 归档 {stats.archived}
        </button>
      </div>

      {/* 视图 */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-orange-600 dark:text-amber-400">
            <IconFolder width={26} height={26} />
          </span>
          <p className="font-medium text-zinc-600 dark:text-zinc-300">
            {projects.length === 0 ? "还没有项目，点击右上角新建" : "没有匹配的项目"}
          </p>
        </div>
      ) : view === "board" ? (
        <BoardView
          visible={visible}
          projects={projects}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onStage={handleStage}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* 项目列表 */}
          <div className="hidden lg:block">
            <div className="sticky top-6 space-y-1.5 self-start">
              {visible.map((p) => (
                <ProjectListItem
                  key={p.id}
                  project={p}
                  active={p.id === effectiveId}
                  onSelect={() => setSelectedId(p.id)}
                />
              ))}
            </div>
          </div>

          {/* 详情面板 */}
          <div className="min-w-0">
            {/* 移动端项目选择 */}
            <Select
              value={effectiveId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="mb-3 w-full lg:hidden"
              title="选择项目"
            >
              {visible.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.blocked ? "⚠️ " : ""}
                  {STAGE_META[p.stage].emoji} {p.name}
                </option>
              ))}
            </Select>

            {selected ? (
              <ProjectDetail
                key={selected.id}
                project={selected}
                onDelete={handleDelete}
                onStage={handleStage}
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-400 dark:border-zinc-700">
                从左侧选择项目查看详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 紧凑的项目列表项 */
function ProjectListItem({
  project: p,
  active,
  onSelect,
}: {
  project: Project;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-zinc-200 bg-white hover:border-amber-500/40 dark:border-zinc-800 dark:bg-zinc-900/60"
      }`}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {p.blocked && <span title="阻塞中">⚠️</span>}
        <span className="min-w-0 flex-1 truncate">{p.name}</span>
        <span className="shrink-0 text-xs" title={STAGE_META[p.stage].label}>
          {STAGE_META[p.stage].emoji}
        </span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
            style={{ width: `${projectProgress(p)}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-zinc-400">
          {projectProgress(p)}%
        </span>
      </div>
      <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-600">
        {STAGE_META[p.stage].label} · 已 {stageDurationDays(p, p.stage) ?? 1} 天 ·{" "}
        {p.logs.length} 条记录
        {p.archived ? " · 已归档" : ""}
      </p>
    </button>
  );
}

/** 看板视图：三列拖拽 */
function BoardView({
  visible,
  projects,
  dragOver,
  setDragOver,
  onStage,
}: {
  visible: Project[];
  projects: Project[];
  dragOver: ProjectStage | null;
  setDragOver: React.Dispatch<React.SetStateAction<ProjectStage | null>>;
  onStage: (p: Project, stage: ProjectStage) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {STAGE_ORDER.map((stage) => {
        const meta = STAGE_META[stage];
        const stageProjects = visible.filter((p) => p.stage === stage);
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(stage);
            }}
            onDragLeave={() => setDragOver((v) => (v === stage ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData("text/plain");
              const p = projects.find((x) => x.id === id);
              if (p && p.stage !== stage) onStage(p, stage);
            }}
            className={`flex min-h-[16rem] flex-col gap-2 rounded-2xl border p-3 transition-colors ${
              dragOver === stage
                ? "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/30"
                : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950/30"
            }`}
          >
            <p className="flex items-center justify-between px-1 text-sm font-medium">
              <span>
                {meta.emoji} {meta.label}
              </span>
              <span className="rounded-full bg-zinc-200/80 px-2 text-xs tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {stageProjects.length}
              </span>
            </p>
            {stageProjects.length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
                拖拽项目卡片到这里
              </p>
            )}
            {stageProjects.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                className="cursor-grab rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-900/70"
              >
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {p.blocked && <span title="阻塞中">⚠️</span>}
                  {p.name}
                  {p.archived && <span className="text-[10px] text-zinc-400">（归档）</span>}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                      style={{ width: `${projectProgress(p)}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-zinc-400">
                    {projectProgress(p)}%
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-600">
                  本阶段 {stageDurationDays(p, p.stage) ?? 1} 天 · {p.logs.length} 条记录
                </p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** 项目详情面板 */
function ProjectDetail({
  project: p,
  onDelete,
  onStage,
}: {
  project: Project;
  onDelete: (p: Project) => void;
  onStage: (p: Project, stage: ProjectStage) => void;
}) {
  const router = useRouter();
  const sessions = useSessions();
  const prompts = usePrompts();
  const settings = useAppSettings();

  const [logText, setLogText] = useState("");
  const [gen, setGen] = useState<GenState | null>(null);
  const [linkSessionId, setLinkSessionId] = useState("");
  const [linkPromptId, setLinkPromptId] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const meta = STAGE_META[p.stage];
  const stageIdx = STAGE_ORDER.indexOf(p.stage);
  const provider = settings.providers[settings.activeProviderId];
  const aiModel = provider?.models[0] ?? "";
  const daysLeft = p.deadline ? Math.ceil((p.deadline - now()) / DAY) : null;

  const startGen = (kind: ProjectAiKind) => {
    if (gen?.running) return;
    if (!provider?.apiKey) {
      setGen({ kind, output: "", running: false, error: "请先在设置页配置 API Key" });
      return;
    }
    if (!aiModel) {
      setGen({ kind, output: "", running: false, error: "当前提供商没有可用模型" });
      return;
    }
    setGen({ kind, output: "", running: true });
    const controller = new AbortController();
    abortRef.current = controller;
    let text = "";
    void streamChat(
      {
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        model: aiModel,
        messages: buildProjectAiMessages(p, kind),
        providerId: settings.activeProviderId,
      },
      {
        onDelta: (content) => {
          text += content;
          setGen((prev) => (prev ? { ...prev, output: text } : prev));
        },
        onDone: () => {
          setGen((prev) => (prev ? { ...prev, running: false } : prev));
          abortRef.current = null;
          if (text.trim()) {
            addProjectLog(p.id, projectAiLogText(kind, text), "ai");
            logActivity("project", `AI 生成${PROJECT_AI_META[kind].label}`, p.name);
          }
        },
        onError: (message) => {
          setGen((prev) => (prev ? { ...prev, running: false, error: message } : prev));
          abortRef.current = null;
        },
      },
      controller.signal,
    );
  };

  const openSession = (id: string) => {
    setTransfer(undefined, id);
    router.push("/chat");
  };

  const openPrompt = (id: string) => {
    const t = prompts.find((x) => x.id === id);
    if (!t) return;
    setTransfer(fillTemplate(t.content, {}));
    router.push("/chat");
  };

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
      {/* 基本信息 */}
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
                prev.map((x) =>
                  x.id === p.id ? { ...x, name: e.target.value, updatedAt: Date.now() } : x,
                ),
              )
            }
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold outline-none transition-colors focus:border-amber-500/50 dark:bg-transparent"
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
            className={`${inputCls} mt-1.5 !py-1.5 text-xs`}
            placeholder="补充描述（可选）…"
          />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
            {p.blocked ? "⚠️ " : ""}
            {meta.label}
          </span>
          {p.archived && (
            <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] text-zinc-500">
              已归档
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(p)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
          title="删除项目"
        >
          <IconTrash width={14} height={14} />
        </button>
      </div>

      {/* 进度 */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
            style={{ width: `${projectProgress(p)}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-zinc-400">{projectProgress(p)}%</span>
      </div>

      {/* 阶段时间线 */}
      <div className="px-2">
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
                      className={`h-full rounded-full transition-all ${i <= stageIdx ? sMeta.line : "w-0"}`}
                    />
                  </div>
                )}
                <div className="flex w-20 shrink-0 flex-col items-center gap-1">
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

      {/* 操作行 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
          当前阶段已 {stageDurationDays(p, p.stage) ?? 1} 天
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-600">
          📅 截止
          <input
            type="date"
            value={p.deadline ? new Date(p.deadline).toISOString().slice(0, 10) : ""}
            onChange={(e) =>
              setProjectDeadline(
                p.id,
                e.target.value ? new Date(e.target.value).getTime() : undefined,
              )
            }
            className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950/60"
          />
          {daysLeft !== null && (
            <span className={daysLeft < 0 ? "font-medium text-red-500" : "text-emerald-600"}>
              {daysLeft < 0 ? `已逾期 ${-daysLeft} 天` : `剩 ${daysLeft} 天`}
            </span>
          )}
        </label>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              toggleProjectBlocked(p.id);
              logActivity("project", p.blocked ? "解除阻塞" : "标记阻塞", p.name);
            }}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              p.blocked
                ? "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400"
                : "border-zinc-300 text-zinc-600 hover:border-red-400 hover:text-red-500 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {p.blocked ? "解除阻塞" : "阻塞"}
          </button>
          <button
            type="button"
            onClick={() => {
              downloadText(
                `project-${p.name}.md`,
                projectReportMarkdown(p),
                "text/markdown;charset=utf-8",
              );
              logActivity("project", "导出项目报告", p.name);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          >
            <IconDownload width={12} height={12} />
            报告
          </button>
          {stageIdx > 0 && (
            <button
              type="button"
              onClick={() => onStage(p, STAGE_ORDER[stageIdx - 1])}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
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
            <button
              type="button"
              onClick={() => {
                toggleProjectArchived(p.id);
                logActivity("project", p.archived ? "取消归档" : "归档项目", p.name);
              }}
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              {p.archived ? "取消归档" : "🗄 归档"}
            </button>
          )}
        </span>
      </div>

      {/* 日志时间线 */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
        <p className="mb-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          🕐 记录时间线（{p.logs.length} 条）
        </p>
        <div className="relative max-h-72 space-y-3 overflow-y-auto pl-1">
          <span className="absolute bottom-1 left-[5px] top-1 w-px bg-zinc-200 dark:bg-zinc-700" />
          {p.logs.map((log) => (
            <div key={log.id} className="relative flex gap-3">
              <span
                className={`z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-zinc-50 dark:ring-zinc-950/40 ${
                  log.kind === "stage"
                    ? "bg-sky-500"
                    : log.kind === "ai"
                      ? "bg-rose-500"
                      : log.kind === "note"
                        ? "bg-orange-500"
                        : "bg-amber-500"
                }`}
              />
              <div className="min-w-0">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
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

      {/* AI 助手 */}
      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          🤖 AI 助手（当前：{provider?.name ?? "未配置"} · {aiModel || "无模型"}）
        </p>
        {!gen || (!gen.running && !gen.output && !gen.error) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(PROJECT_AI_META) as ProjectAiKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => startGen(kind)}
                className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
              >
                {PROJECT_AI_META[kind].emoji} 生成{PROJECT_AI_META[kind].label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span>
                {PROJECT_AI_META[gen.kind].emoji} {PROJECT_AI_META[gen.kind].label}
              </span>
              {gen.running ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-600" />
                  <span className="text-zinc-400">生成中，完成后自动写入时间线…</span>
                  <button
                    type="button"
                    onClick={() => {
                      abortRef.current?.abort();
                      setGen((prev) => (prev ? { ...prev, running: false } : prev));
                    }}
                    className="ml-auto text-red-500 hover:underline"
                  >
                    停止
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setGen(null)}
                  className="ml-auto flex items-center gap-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <IconX width={12} height={12} /> 收起
                </button>
              )}
            </div>
            {gen.error && <p className="mt-1 text-xs text-red-500">⚠️ {gen.error}</p>}
            {gen.output && (
              <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
                {gen.output}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 关联资源 */}
      <div className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          🔗 关联资源（点击直达对话）
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={linkSessionId}
            onChange={(e) => setLinkSessionId(e.target.value)}
            className="max-w-[12rem]"
            title="选择会话"
          >
            <option value="">选择会话…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => {
              const s = sessions.find((x) => x.id === linkSessionId);
              if (!s) return;
              linkProjectSession(p.id, { id: s.id, title: s.title });
              setLinkSessionId("");
              logActivity("project", "关联会话", `${p.name} · ${s.title}`);
            }}
            disabled={!linkSessionId}
            className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          >
            + 关联
          </button>
          <Select
            value={linkPromptId}
            onChange={(e) => setLinkPromptId(e.target.value)}
            className="max-w-[12rem]"
            title="选择提示词"
          >
            <option value="">选择提示词…</option>
            {prompts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => {
              const t = prompts.find((x) => x.id === linkPromptId);
              if (!t) return;
              linkProjectPrompt(p.id, { id: t.id, title: t.title });
              setLinkPromptId("");
              logActivity("project", "关联提示词", `${p.name} · ${t.title}`);
            }}
            disabled={!linkPromptId}
            className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          >
            + 关联
          </button>
        </div>
        {(p.linkedSessions?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.linkedSessions!.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 py-0.5 pl-2.5 pr-1 text-xs text-sky-700 dark:text-sky-300"
              >
                <button
                  type="button"
                  onClick={() => openSession(s.id)}
                  className="max-w-[12rem] truncate hover:underline"
                  title="在对话中打开"
                >
                  💬 {s.title}
                </button>
                <button
                  type="button"
                  onClick={() => unlinkProjectSession(p.id, s.id)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-sky-400 hover:bg-sky-500/20"
                  title="取消关联"
                >
                  <IconX width={9} height={9} />
                </button>
              </span>
            ))}
          </div>
        )}
        {(p.linkedPrompts?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.linkedPrompts!.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 py-0.5 pl-2.5 pr-1 text-xs text-amber-700 dark:text-amber-300"
              >
                <button
                  type="button"
                  onClick={() => openPrompt(t.id)}
                  className="max-w-[12rem] truncate hover:underline"
                  title="套用提示词并打开对话"
                >
                  📌 {t.title}
                </button>
                <button
                  type="button"
                  onClick={() => unlinkProjectPrompt(p.id, t.id)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-amber-500 hover:bg-amber-500/20"
                  title="取消关联"
                >
                  <IconX width={9} height={9} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface GenState {
  kind: ProjectAiKind;
  output: string;
  running: boolean;
  error?: string;
}
