"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { toggleTheme, useIsDark } from "@/lib/theme";
import {
  IconChat,
  IconCompare,
  IconHome,
  IconLogo,
  IconMoon,
  IconPrompts,
  IconSettings,
  IconSun,
  IconTools,
} from "./icons";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  exact?: boolean;
}

const NAV_MAIN: NavItem[] = [
  { href: "/", label: "首页", icon: IconHome, exact: true },
  { href: "/chat", label: "AI 对话", icon: IconChat },
  { href: "/compare", label: "模型对比", icon: IconCompare },
  { href: "/tools", label: "文本工具", icon: IconTools },
  { href: "/prompts", label: "提示词库", icon: IconPrompts },
];

const NAV_SYS: NavItem[] = [{ href: "/settings", label: "设置", icon: IconSettings }];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dark = useIsDark();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href + "/") || pathname === href;

  return (
    <div className="flex h-dvh w-full">
      {/* 桌面侧边栏 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200/70 bg-white/60 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/60 md:flex">
        <Link
          href="/"
          className="flex items-center gap-2.5 px-5 pb-4 pt-5 text-lg font-semibold tracking-tight"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 ring-1 ring-white/20">
            <IconLogo width={17} height={17} />
          </span>
          <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent dark:from-amber-400 dark:to-orange-400">
            AIDesk
          </span>
          <span className="ml-auto rounded-full border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
            AI 工作台
          </span>
        </Link>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            功能
          </p>
          {NAV_MAIN.map(({ href, label, icon: Icon, exact }) => (
            <NavLink
              key={href}
              href={href}
              active={isActive(href, exact)}
              icon={<Icon width={18} height={18} />}
              label={label}
            />
          ))}
          <p className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
            系统
          </p>
          {NAV_SYS.map(({ href, label, icon: Icon }) => (
            <NavLink
              key={href}
              href={href}
              active={isActive(href)}
              icon={<Icon width={18} height={18} />}
              label={label}
            />
          ))}
        </nav>

        <div className="space-y-2 border-t border-zinc-200/70 p-3 dark:border-zinc-800/70">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            {dark ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
            {dark ? "浅色模式" : "深色模式"}
          </button>
          <p className="px-3 text-[10px] text-zinc-400 dark:text-zinc-600">
            AIDesk v0.1.0 · 数据本地存储
          </p>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <header className="flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-zinc-200 bg-white/80 px-4 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/80 md:hidden">
        <Link href="/" className="flex items-center gap-2 pr-2 text-base font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-orange-500 text-white">
            <IconLogo width={14} height={14} />
          </span>
          AIDesk
        </Link>
        {[...NAV_MAIN, ...NAV_SYS].map(({ href, label, exact }) => (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
              isActive(href, exact)
                ? "bg-amber-500/10 font-medium text-orange-600 dark:text-amber-400"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {label}
          </Link>
        ))}
      </header>

      {/* 主内容区：不限宽，铺满剩余空间 */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="w-full px-5 py-8 md:px-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}

function NavLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-amber-500/10 font-medium text-orange-700 dark:bg-amber-500/15 dark:text-amber-300"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
