"use client";

import { useState } from "react";
import { logActivity } from "@/lib/activity-store";
import { confirmDialog } from "@/lib/confirm-store";
import { toast } from "@/lib/toast-store";
import {
  addProjectLog,
  createProject,
  deleteProject,
  deleteProjectLog,
  updateProjectLog,
  updateProjects,
  useProjects,
  type Project,
} from "@/lib/projects-store";
import { IconEdit, IconPlus, IconTrash, IconX } from "../icons";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-950/60";

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** 时间戳（模块级封装） */
function now(): number {
  return Date.now();
}

/** 时间戳 → datetime-local 输入值（本地时区，精确到分钟） */
function toDateTimeLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** 极简项目记录：只记录哪个项目、什么时间、做了什么 */
export default function ProjectsApp() {
  const projects = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [logText, setLogText] = useState("");
  const [recordTime, setRecordTime] = useState(() => toDateTimeLocal(now()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTime, setEditTime] = useState("");

  const effectiveId = selectedId ?? projects[0]?.id ?? null;
  const project = projects.find((p) => p.id === effectiveId) ?? null;

  const handleNew = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const p = createProject(name);
    setSelectedId(p.id);
    setNewName("");
    logActivity("project", "新建项目", p.name);
    toast.success(`已创建「${p.name}」，开始记录吧`);
  };

  const handleDelete = async (p: Project) => {
    const ok = await confirmDialog({
      message: `确定删除项目「${p.name}」？`,
      detail: "全部时间线记录将一并删除，不可恢复。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    deleteProject(p.id);
    if (selectedId === p.id) setSelectedId(null);
    logActivity("project", "删除项目", p.name);
    toast.success(`已删除「${p.name}」`);
  };

  const handleRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    const text = logText.trim();
    if (!text) return;
    const ts = recordTime ? new Date(recordTime).getTime() : now();
    addProjectLog(project.id, text, "note", Number.isFinite(ts) ? ts : now());
    logActivity("project", "添加项目记录", `${project.name} · ${text.slice(0, 40)}`);
    setLogText("");
    setRecordTime(toDateTimeLocal(now()));
  };

  const handleDeleteLog = async (logId: string, text: string) => {
    if (!project) return;
    const ok = await confirmDialog({
      message: "删除这条记录？",
      detail: text.slice(0, 80),
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    deleteProjectLog(project.id, logId);
    logActivity("project", "删除项目记录", project.name);
    toast.success("已删除该记录");
  };

  const startEditLog = (logId: string, text: string, time: number) => {
    setEditingId(logId);
    setEditText(text);
    setEditTime(toDateTimeLocal(time));
  };

  const saveEditLog = () => {
    if (!project || !editingId) return;
    const text = editText.trim();
    if (!text) {
      setEditingId(null);
      return;
    }
    const ts = editTime ? new Date(editTime).getTime() : undefined;
    updateProjectLog(
      project.id,
      editingId,
      text,
      ts !== undefined && Number.isFinite(ts) ? ts : undefined,
    );
    logActivity("project", "修改项目记录", project.name);
    toast.success("记录已更新");
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">项目记录</h1>
        <p className="mt-1.5 text-zinc-600 dark:text-zinc-400">
          只做一件事：记录哪个项目、在什么时间、做了什么。
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* 项目列表 */}
        <div>
          <form onSubmit={handleNew} className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新建项目…"
              className={inputCls}
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
              title="新建项目"
            >
              <IconPlus width={16} height={16} />
            </button>
          </form>

          <div className="mt-2 space-y-1.5">
            {projects.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
                还没有项目，输入名称创建一个
              </p>
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  p.id === effectiveId
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-zinc-200 bg-white hover:border-amber-500/40 dark:border-zinc-800 dark:bg-zinc-900/60"
                }`}
              >
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
                  {p.logs.length} 条记录 · 最后 {formatDateTime(p.updatedAt)}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* 记录区 */}
        {project ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={project.name}
                onChange={(e) =>
                  updateProjects((prev) =>
                    prev.map((x) =>
                      x.id === project.id
                        ? { ...x, name: e.target.value, updatedAt: Date.now() }
                        : x,
                    ),
                  )
                }
                className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold outline-none transition-colors focus:border-amber-500/50 dark:bg-transparent"
                placeholder="项目名称"
              />
              <button
                type="button"
                onClick={() => handleDelete(project)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                title="删除项目"
              >
                <IconTrash width={14} height={14} />
              </button>
            </div>

            {/* 记录输入（主角） */}
            <form className="mt-4 flex items-center gap-2" onSubmit={handleRecord}>
              <input
                type="datetime-local"
                value={recordTime}
                onChange={(e) => setRecordTime(e.target.value)}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs tabular-nums outline-none transition-colors focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950/60"
                title="记录时间（默认当前时间）"
              />
              <input
                type="text"
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                placeholder="记录一下刚才做了什么，回车即记录…"
                className={`${inputCls} !py-2.5 text-sm`}
              />
              <button
                type="submit"
                disabled={!logText.trim()}
                className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                记录
              </button>
            </form>

            {/* 记录时间线（最新在前） */}
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
              <p className="mb-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                🕐 记录时间线（{project.logs.length} 条）
              </p>
              <div className="relative max-h-[58vh] space-y-3 overflow-y-auto pl-1">
                <span className="absolute bottom-1 left-[5px] top-1 w-px bg-zinc-200 dark:bg-zinc-700" />
                {[...project.logs].reverse().map((log) => (
                  <div key={log.id} className="group relative flex gap-3">
                    <span className="z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 ring-2 ring-zinc-50 dark:ring-zinc-950/40" />
                    <div className="min-w-0 flex-1">
                      {editingId === log.id ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                saveEditLog();
                              } else if (e.key === "Escape") {
                                setEditingId(null);
                              }
                            }}
                            className="w-full rounded-md border border-amber-500 bg-white px-2 py-1 text-sm outline-none ring-2 ring-amber-500/20 dark:bg-zinc-950/60"
                            autoFocus
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="datetime-local"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  saveEditLog();
                                } else if (e.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs tabular-nums outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950/60"
                              title="修改记录时间"
                            />
                            <button
                              type="button"
                              onClick={saveEditLog}
                              className="rounded-md bg-orange-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-500"
                            >
                              ✓ 保存
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                            {log.text}
                          </p>
                          <p className="mt-0.5 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-600">
                            {formatDateTime(log.time)}
                          </p>
                        </>
                      )}
                    </div>
                    {editingId !== log.id && (
                      <span className="absolute right-0 top-0 flex items-center gap-0.5 opacity-0 transition-all group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startEditLog(log.id, log.text, log.time)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-amber-500/10 hover:text-orange-500"
                          title="修改这条记录"
                        >
                          <IconEdit width={12} height={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLog(log.id, log.text)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-red-500/10 hover:text-red-500"
                          title="删除这条记录"
                        >
                          <IconX width={12} height={12} />
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                {project.logs.length === 0 && (
                  <p className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
                    还没有记录，输入上方内容开始
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-400 dark:border-zinc-700">
            从左侧选择项目开始记录
          </div>
        )}
      </div>
    </div>
  );
}
