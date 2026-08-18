import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * 连接是懒建的：构建镜像时通常没有 DATABASE_URL，
 * 若在模块求值阶段就抛错，next build 会直接失败。放到首次查询时再检查。
 *
 * dev 下 Turbopack 热更新会反复求值模块，每次新建连接池会很快耗尽 Postgres 连接数，
 * 因此把连接挂到 globalThis 上复用；生产只求值一次，无此问题。
 */
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("缺少 DATABASE_URL：复制 .env.example 为 .env.local，或先 pnpm db:up");
  }
  const sql = globalForDb.sql ?? postgres(url, { max: 10 });
  if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
  return drizzle(sql, { schema });
}

/** 首次访问任意属性时才真正建连 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    globalForDb.db ??= connect();
    return Reflect.get(globalForDb.db, prop, globalForDb.db);
  },
});
