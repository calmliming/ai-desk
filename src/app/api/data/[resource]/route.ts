import {
  readActivity,
  readCompareSlots,
  readProjects,
  readPrompts,
  readSessions,
  writeActivity,
  writeCompareSlots,
  writeProjects,
  writePrompts,
  writeSessions,
} from "@/db/collections";

/**
 * 各 store 的读写端点：GET 取整份集合，PUT 用整份集合覆盖。
 * 客户端 store 本来就持有完整数组，沿用这个粒度可以让 useSyncExternalStore
 * 那套调用方式原样保留，改动只落在持久化这一层。
 */

interface Collection {
  read: () => Promise<unknown>;
  write: (data: never) => Promise<void>;
}

const COLLECTIONS: Record<string, Collection> = {
  sessions: { read: readSessions, write: writeSessions as Collection["write"] },
  prompts: { read: readPrompts, write: writePrompts as Collection["write"] },
  projects: { read: readProjects, write: writeProjects as Collection["write"] },
  activity: { read: readActivity, write: writeActivity as Collection["write"] },
  compare: { read: readCompareSlots, write: writeCompareSlots as Collection["write"] },
};

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/data/[resource]">) {
  const { resource } = await ctx.params;
  const collection = COLLECTIONS[resource];
  if (!collection) return fail(`未知的数据集合：${resource}`, 404);

  try {
    return Response.json(await collection.read());
  } catch (err) {
    console.error(`[data] 读取 ${resource} 失败`, err);
    return fail("数据库读取失败", 500);
  }
}

export async function PUT(request: Request, ctx: RouteContext<"/api/data/[resource]">) {
  const { resource } = await ctx.params;
  const collection = COLLECTIONS[resource];
  if (!collection) return fail(`未知的数据集合：${resource}`, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("请求体不是合法 JSON", 400);
  }
  if (!Array.isArray(body)) return fail("请求体应为数组", 400);

  try {
    await collection.write(body as never);
    return Response.json({ ok: true, count: body.length });
  } catch (err) {
    console.error(`[data] 写入 ${resource} 失败`, err);
    return fail("数据库写入失败", 500);
  }
}
