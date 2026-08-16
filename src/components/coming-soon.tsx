import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight, IconCheck } from "./icons";

export default function ComingSoon({
  icon,
  title,
  description,
  features,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  features: string[];
}) {
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4 pt-2">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 text-orange-600 dark:text-amber-400">
          {icon}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-1.5 text-zinc-600 dark:text-zinc-400">{description}</p>
        </div>
      </header>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          规划中的功能
        </h2>
        <ul className="mt-4 space-y-2.5">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-center gap-2.5 rounded-lg border border-zinc-200/80 px-3.5 py-2.5 text-sm text-zinc-600 dark:border-zinc-800/80 dark:text-zinc-300"
            >
              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <IconCheck width={11} height={11} strokeWidth={2.6} />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-zinc-600 dark:text-zinc-300">
        <p>本模块将在后续阶段实现。你可以先去配置 API Key，为对话功能做好准备。</p>
        <Link
          href="/settings"
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          去设置 <IconArrowRight width={14} height={14} />
        </Link>
      </div>
    </div>
  );
}
