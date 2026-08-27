"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { costOf, formatCost, formatTokens, MODEL_META } from "@/lib/pricing";
import { useAppSettings } from "@/lib/settings-store";
import { useSessions } from "@/lib/sessions-store";
import { setTransfer } from "@/lib/transfer";

interface SessionRow {
  id: string;
  title: string;
  providerId: string;
  model: string;
  input: number;
  output: number;
  cost: number;
  updatedAt: number;
}

/** 用量与花费看板：基于上游返回的 token 用量 × 参考价格估算 */
export default function StatsApp() {
  const sessions = useSessions();
  const settings = useAppSettings();
  const router = useRouter();

  const data = useMemo(() => {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let usedSessions = 0;
    const byProvider = new Map<
      string,
      { name: string; input: number; output: number; cost: number }
    >();
    const bySession: SessionRow[] = [];
    const byDay = new Map<string, number>();

    for (const s of sessions) {
      let sIn = 0;
      let sOut = 0;
      let sCost = 0;
      for (const m of s.messages) {
        if (!m.usage) continue;
        const cost = costOf(s.providerId, m.modelUsed ?? s.model, m.usage);
        sIn += m.usage.promptTokens;
        sOut += m.usage.completionTokens;
        sCost += cost;
        const day = new Date(m.createdAt).toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + cost);
      }
      if (sIn + sOut <= 0) continue;
      usedSessions += 1;
      totalInput += sIn;
      totalOutput += sOut;
      totalCost += sCost;
      bySession.push({
        id: s.id,
        title: s.title,
        providerId: s.providerId,
        model: s.model,
        input: sIn,
        output: sOut,
        cost: sCost,
        updatedAt: s.updatedAt,
      });
      let p = byProvider.get(s.providerId);
      if (!p) {
        p = {
          name: settings.providers[s.providerId]?.name ?? s.providerId,
          input: 0,
          output: 0,
          cost: 0,
        };
        byProvider.set(s.providerId, p);
      }
      p.input += sIn;
      p.output += sOut;
      p.cost += sCost;
    }

    bySession.sort((a, b) => b.cost - a.cost);
    const providers = [...byProvider.values()].sort((a, b) => b.cost - a.cost);
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30);
    const maxDay = Math.max(0.0001, ...days.map(([, c]) => c));

    return {
      totalInput,
      totalOutput,
      totalCost,
      usedSessions,
      providers,
      sessions: bySession.slice(0, 15),
      days,
      maxDay,
    };
  }, [sessions, settings.providers]);

  const openSession = (id: string) => {
    setTransfer(undefined, id);
    router.push("/chat");
  };

  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">用量与花费</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          按上游返回的 token 用量 × 参考价格估算（元/百万 tokens），仅供本机参考，非官方账单。
        </p>
      </header>

      {/* 汇总卡片 */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { value: formatCost(data.totalCost), label: "估算花费", hint: "全部会话累计" },
          { value: formatTokens(data.totalInput), label: "输入 tokens", hint: "含系统提示与上下文" },
          { value: formatTokens(data.totalOutput), label: "输出 tokens", hint: "模型生成内容" },
          { value: String(data.usedSessions), label: "产生用量的会话", hint: "有 usage 记录" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none"
          >
            <p className="text-xl font-semibold tabular-nums tracking-tight text-orange-600 dark:text-amber-400">
              {s.value}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{s.label}</p>
            <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">{s.hint}</p>
          </div>
        ))}
      </div>

      {data.usedSessions === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          还没有 token 用量记录——去对话页发一条消息，这里就会显示花费估算。
        </div>
      ) : (
        <>
          {/* 近 30 天花费趋势 */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              近 30 天每日花费
            </h2>
            <div className="mt-4 flex h-28 items-end gap-[3px]">
              {data.days.map(([day, cost]) => (
                <div
                  key={day}
                  className="group relative flex-1"
                  title={`${day} · ${formatCost(cost)}`}
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-orange-500 to-amber-400 transition-opacity group-hover:opacity-80"
                    style={{ height: `${Math.max(3, (cost / data.maxDay) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-600">
              <span>{data.days[0] ? dayLabel(data.days[0][0]) : ""}</span>
              <span>{data.days.at(-1) ? dayLabel(data.days.at(-1)![0]) : ""}</span>
            </div>
          </section>

          {/* 按提供商 */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              按提供商
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                    <th className="pb-2 pr-4 font-medium">提供商</th>
                    <th className="pb-2 pr-4 font-medium">输入</th>
                    <th className="pb-2 pr-4 font-medium">输出</th>
                    <th className="pb-2 pr-4 font-medium">合计 tokens</th>
                    <th className="pb-2 font-medium">花费</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p) => (
                    <tr
                      key={p.name}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                    >
                      <td className="py-2.5 pr-4 font-medium">{p.name}</td>
                      <td className="py-2.5 pr-4 tabular-nums text-zinc-600 dark:text-zinc-300">
                        {formatTokens(p.input)}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-zinc-600 dark:text-zinc-300">
                        {formatTokens(p.output)}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-zinc-600 dark:text-zinc-300">
                        {formatTokens(p.input + p.output)}
                      </td>
                      <td className="py-2.5 font-medium tabular-nums text-orange-600 dark:text-amber-400">
                        {formatCost(p.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 按会话 Top 15 */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              花费最高的会话（Top {data.sessions.length}）
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                    <th className="pb-2 pr-4 font-medium">会话</th>
                    <th className="pb-2 pr-4 font-medium">模型</th>
                    <th className="pb-2 pr-4 font-medium">tokens</th>
                    <th className="pb-2 font-medium">花费</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                    >
                      <td className="max-w-[260px] py-2.5 pr-4">
                        <button
                          type="button"
                          onClick={() => openSession(s.id)}
                          className="block max-w-full truncate text-left font-medium text-zinc-700 transition-colors hover:text-orange-600 dark:text-zinc-200 dark:hover:text-amber-400"
                          title={`打开会话：${s.title}`}
                        >
                          {s.title}
                        </button>
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {s.model}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-zinc-600 dark:text-zinc-300">
                        {formatTokens(s.input + s.output)}
                      </td>
                      <td className="py-2.5 font-medium tabular-nums text-orange-600 dark:text-amber-400">
                        {formatCost(s.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* 价格参考 */}
      <details className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          价格参考（元 / 百万 tokens）
        </summary>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {Object.entries(MODEL_META).map(([model, meta]) => (
            <div
              key={model}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-1.5 text-xs dark:border-zinc-800/60"
            >
              <span className="truncate font-mono text-zinc-600 dark:text-zinc-300">{model}</span>
              <span className="shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">
                入 {meta.input} / 出 {meta.output} · 上下文 {formatTokens(meta.context)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          未列入的模型按提供商默认价估算；自定义提供商按 ¥2 / ¥8（入/出）兜底。价格随厂商调价可能变动。
        </p>
      </details>
    </div>
  );
}
