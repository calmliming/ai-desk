"use client";

import { useState, useSyncExternalStore } from "react";
import { logActivity } from "@/lib/activity-store";
import { toast } from "@/lib/toast-store";
import {
  clearLegacyData,
  hasLegacyData,
  migrateLegacyData,
  type MigrationResult,
} from "@/lib/legacy-migration";

const LABELS: Record<string, string> = {
  sessions: "对话会话",
  prompts: "提示词",
  projects: "项目",
  activity: "操作记录",
  compare: "对比槽位",
};

/**
 * 数据从 localStorage 迁到 Postgres 后的一次性搬运入口。
 * 只在浏览器里确实还留着旧数据时出现，搬完清掉旧副本后自动隐藏。
 */
/** 无需订阅：localStorage 里的旧数据只会被本组件清掉一次，用 cleared 触发重渲染即可 */
const NO_SUBSCRIBE = () => () => {};

export default function DataMigration() {
  const [pending, setPending] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  // localStorage 只能在客户端读，服务端快照固定为 false，避免 hydration 不一致
  const legacy = useSyncExternalStore(NO_SUBSCRIBE, hasLegacyData, () => false);

  if (!legacy || cleared) return null;

  const handleMigrate = async () => {
    setPending(true);
    const res = await migrateLegacyData();
    setResult(res);
    setPending(false);

    const total = Object.values(res.migrated).reduce((a, b) => a + b, 0);
    if (res.errors.length > 0) toast.error("部分数据迁移失败，详见下方");
    else if (total > 0) {
      toast.success(`已迁移 ${total} 条数据`);
      logActivity("settings", "迁移本地数据到数据库", `共 ${total} 条`);
    } else toast.info("没有需要迁移的数据");
  };

  const handleClear = () => {
    clearLegacyData();
    setCleared(true);
    toast.success("已清除浏览器中的旧副本");
  };

  return (
    <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
      <h3 className="text-sm font-semibold">迁移浏览器中的历史数据</h3>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        检测到浏览器 localStorage 里还留着旧版数据。点击迁移会把它们写入数据库；
        库中已有内容的集合会自动跳过，不会覆盖。设置与 API Key 不参与迁移，仍只保存在本机浏览器。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={handleMigrate}
          disabled={pending}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "迁移中…" : "开始迁移"}
        </button>
        {result && result.errors.length === 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg px-4 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          >
            清除浏览器旧副本
          </button>
        )}
      </div>

      {result && (
        <div className="mt-4 space-y-1.5 text-sm">
          {Object.entries(result.migrated).map(([key, count]) => (
            <p key={key} className="text-emerald-700 dark:text-emerald-400">
              ✅ {LABELS[key] ?? key}：已迁移 {count} 条
            </p>
          ))}
          {result.skipped.map((key) => (
            <p key={key} className="text-zinc-500 dark:text-zinc-400">
              ⏭ {LABELS[key] ?? key}：库中已有数据，已跳过
            </p>
          ))}
          {result.errors.map((err) => (
            <p key={err} className="text-red-600 dark:text-red-400">
              ⚠️ {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
