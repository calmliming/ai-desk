"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ComponentType, type ReactNode, type SVGProps } from "react";
import { toggleTheme, useIsDark } from "@/lib/theme";
import { toggleSidebar, useSidebarCollapsed } from "@/lib/ui-store";
import { openCommandPalette } from "@/lib/command-store";
import Toaster from "@/components/ui/toaster";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import CommandPalette from "@/components/ui/command-palette";
import {
  IconChat,
  IconChevronsLeft,
  IconChevronsRight,
  IconCompare,
  IconFolder,
  IconHistory,
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
  { href: "/projects", label: "项目记录", icon: IconFolder },
];

const NAV_SYS: NavItem[] = [
  { href: "/settings", label: "设置", icon: IconSettings },
  { href: "/activity", label: "操作记录", icon: IconHistory },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dark = useIsDark();
  const collapsed = useSidebarCollapsed();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href + "/") || pathname === href;

  // Cmd/Ctrl+K 呼出命令面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommandPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh w-full">
      {/* 桌面侧边栏 */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-zinc-200/70 bg-white/60 backdrop-blur-xl transition-all duration-200 dark:border-zinc-800/70 dark:bg-zinc-950/60 md:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <Link
          href="/"
          title={collapsed ? "AIDesk · 首页" : undefined}
          className={`flex items-center gap-2.5 pb-4 pt-5 text-lg font-semibold tracking-tight ${
            collapsed ? "justify-center px-2" : "px-5"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 ring-1 ring-white/20">
            <IconLogo width={17} height={17} />
          </span>
          {!collapsed && (
            <>
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent dark:from-amber-400 dark:to-orange-400">
                AIDesk
              </span>
              <span className="ml-auto rounded-full border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
                AI 工作台
              </span>
            </>
          )}
        </Link>

        <nav className={`flex-1 space-y-0.5 overflow-y-auto py-2 ${collapsed ? "px-2" : "px-3"}`}>
          {!collapsed && (
            <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
              功能
            </p>
          )}
          {NAV_MAIN.map(({ href, label, icon: Icon, exact }) => (
            <NavLink
              key={href}
              href={href}
              active={isActive(href, exact)}
              icon={<Icon width={18} height={18} />}
              label={label}
              collapsed={collapsed}
            />
          ))}
          {!collapsed && (
            <p className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
              系统
            </p>
          )}
          {NAV_SYS.map(({ href, label, icon: Icon }) => (
            <NavLink
              key={href}
              href={href}
              active={isActive(href)}
              icon={<Icon width={18} height={18} />}
              label={label}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div className="space-y-2 border-t border-zinc-200/70 p-3 dark:border-zinc-800/70">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <IconButton
                onClick={toggleTheme}
                title={dark ? "浅色模式" : "深色模式"}
                icon={dark ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
              />
              <IconButton
                onClick={toggleSidebar}
                title="展开侧边栏"
                icon={<IconChevronsRight width={18} height={18} />}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  {dark ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
                  {dark ? "浅色模式" : "深色模式"}
                </button>
                <IconButton
                  onClick={toggleSidebar}
                  title="收起侧边栏"
                  icon={<IconChevronsLeft width={18} height={18} />}
                />
              </div>
              <p className="px-3 text-[10px] text-zinc-400 dark:text-zinc-600">
                AIDesk v0.1.0 · 数据本地存储
              </p>
            </>
          )}
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

      {/* 全局弹窗组件 */}
      <Toaster />
      <ConfirmDialog />
      <CommandPalette dark={dark} />
    </div>
  );
}

function NavLink({
  href,
  active,
  icon,
  label,
  collapsed,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center rounded-lg text-sm transition-colors ${
        collapsed ? "justify-center gap-2.5 px-0 py-2.5" : "gap-2.5 px-3 py-2"
      } ${
        active
          ? "bg-amber-500/10 font-medium text-orange-700 dark:bg-amber-500/15 dark:text-amber-300"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      }`}
    >
      {icon}
      {!collapsed && label}
    </Link>
  );
}

function IconButton({
  onClick,
  title,
  icon,
}: {
  onClick: () => void;
  title: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      {icon}
    </button>
  );
}
