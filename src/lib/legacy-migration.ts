/**
 * 一次性迁移：把旧版存在浏览器 localStorage 里的数据搬进 Postgres。
 *
 * 只在目标集合为空时写入，绝不覆盖库里已有的数据——重复点击是安全的。
 * 设置（含 API Key）和主题不在此列：它们仍然只存在浏览器本地，不进库。
 */

const LEGACY_KEYS: Record<string, string> = {
  sessions: "aidesk.sessions.v1",
  prompts: "aidesk.prompts.v1",
  projects: "aidesk.projects.v1",
  activity: "aidesk.activity.v1",
  compare: "aidesk.compare.v1",
};

export interface MigrationResult {
  /** 实际写入的集合 → 条数 */
  migrated: Record<string, number>;
  /** 因库中已有数据而跳过的集合 */
  skipped: string[];
  errors: string[];
}

/** 结果缓存：作为 useSyncExternalStore 的快照，必须稳定且不能每次渲染都重新解析 */
let legacyDetected: boolean | null = null;

/** 浏览器里是否还留着旧数据（用于决定要不要提示用户迁移） */
export function hasLegacyData(): boolean {
  if (typeof window === "undefined") return false;
  legacyDetected ??= Object.values(LEGACY_KEYS).some((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  });
  return legacyDetected;
}

function readLegacy(key: string): unknown[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 提示词库首次读取时服务端会种入内置模板，于是「库为空」判断永远不成立。
 * 若库里清一色是内置项，视同空库，允许旧数据覆盖进来。
 */
function onlySeeded(resource: string, remote: unknown[]): boolean {
  if (resource !== "prompts") return false;
  return remote.every((p) => (p as { builtin?: boolean }).builtin === true);
}

export async function migrateLegacyData(): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: {}, skipped: [], errors: [] };

  for (const [resource, key] of Object.entries(LEGACY_KEYS)) {
    const local = readLegacy(key);
    if (!local) continue;

    try {
      const existing = await fetch(`/api/data/${resource}`);
      if (!existing.ok) throw new Error(`读取失败 HTTP ${existing.status}`);
      const remote = await existing.json();
      if (Array.isArray(remote) && remote.length > 0 && !onlySeeded(resource, remote)) {
        result.skipped.push(resource);
        continue;
      }

      const res = await fetch(`/api/data/${resource}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (!res.ok) throw new Error(`写入失败 HTTP ${res.status}`);
      result.migrated[resource] = local.length;
    } catch (err) {
      result.errors.push(`${resource}：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/** 迁移完成并确认无误后调用，清掉浏览器里的旧副本 */
export function clearLegacyData(): void {
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 忽略
    }
  }
  legacyDetected = false;
}
