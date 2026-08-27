"use client";

import { useState } from "react";
import { logActivity } from "@/lib/activity-store";
import { notificationsSupported, requestNotifyPermission } from "@/lib/notifications";
import { toast } from "@/lib/toast-store";
import { streamChat } from "@/lib/chat-client";
import DataMigration from "./data-migration";
import { IconCheck, IconEye, IconKey } from "./icons";
import { CUSTOM_PROVIDER, PROVIDER_PRESETS } from "@/lib/providers";
import { updateAppSettings, useAppSettings } from "@/lib/settings-store";
import type { AppSettings, McpServerConfig, ProviderConfig } from "@/lib/types";

export default function SettingsPanel() {
  const settings = useAppSettings();
  const [selectedId, setSelectedId] = useState<string>("deepseek");
  const [showKey, setShowKey] = useState(false);

  const provider = settings.providers[selectedId];
  const isActive = settings.activeProviderId === selectedId;
  const modelNames = provider ? provider.models.join(", ") : "";
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!provider) return null;

  const updateProvider = (patch: Partial<ProviderConfig>) => {
    updateAppSettings({
      ...settings,
      providers: {
        ...settings.providers,
        [selectedId]: { ...settings.providers[selectedId], ...patch },
      },
    });
  };

  const persist = (next: AppSettings) => {
    updateAppSettings(next);
    toast.success("已保存到本机");
  };

  const handleSetActive = () => {
    persist({ ...settings, activeProviderId: selectedId });
    logActivity("settings", "切换当前提供商", provider.name);
  };

  const handleReset = () => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === selectedId);
    persist({
      ...settings,
      providers: {
        ...settings.providers,
        [selectedId]: preset
          ? { ...preset, models: [...preset.models] }
          : { ...CUSTOM_PROVIDER },
      },
    });
    logActivity("settings", "恢复默认配置", provider.name);
  };

  const handleModelsChange = (value: string) => {
    updateProvider({
      models: value
        .split(/[,，\n]/)
        .map((m) => m.trim())
        .filter(Boolean),
    });
  };

  /** 用当前表单值发起一次最小对话，验证连接是否可用 */
  const handleTest = async () => {
    if (testing) return;
    if (!provider.apiKey) {
      setTestResult({ ok: false, message: "请先填写 API Key" });
      return;
    }
    if (provider.models.length === 0 || !provider.models[0]) {
      setTestResult({ ok: false, message: "请先填写模型列表" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const controller = new AbortController();
    const started = performance.now();
    let reply = "";
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);

    const cleanup = () => window.clearTimeout(timeout);

    await streamChat(
      {
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        model: provider.models[0],
        messages: [{ role: "user", content: "你好，请只回复：收到" }],
      },
      {
        onDelta: (content) => {
          reply += content;
        },
        onDone: () => {
          cleanup();
          setTesting(false);
          const ok = !timedOut;
          const elapsed = ((performance.now() - started) / 1000).toFixed(1);
          setTestResult(
            ok
              ? {
                  ok: true,
                  message: `连接成功（${elapsed}s）${reply.trim() ? ` · 回复：「${reply.trim().slice(0, 30)}」` : ""}`,
                }
              : { ok: false, message: "连接超时（15 秒无响应）" },
          );
          logActivity(
            "settings",
            "测试提供商连接",
            `${provider.name} · ${ok ? "成功" : "失败"}`,
          );
        },
        onError: (message) => {
          cleanup();
          setTesting(false);
          setTestResult({ ok: false, message });
          logActivity("settings", "测试提供商连接", `${provider.name} · 失败`);
        },
      },
      controller.signal,
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* 提供商列表 */}
      <div className="space-y-1">
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
          提供商
        </p>
        {Object.values(settings.providers).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
              p.id === selectedId
                ? "bg-amber-500/10 font-medium text-orange-700 dark:bg-amber-500/15 dark:text-amber-300"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  p.apiKey ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
                title={p.apiKey ? "已配置 Key" : "未配置 Key"}
              />
              <span className="truncate">{p.name}</span>
            </span>
            {settings.activeProviderId === p.id && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:text-amber-400">
                当前
              </span>
            )}
          </button>
        ))}
        <p className="px-2 pt-3 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
          内置预设均使用 OpenAI 兼容接口；选择「自定义」可接入任意兼容服务（如本地 Ollama、LM
          Studio 等）。
        </p>
      </div>

      {/* 配置表单 */}
      <div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 text-orange-600 dark:text-amber-400">
            <IconKey width={20} height={20} />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">{provider.name}</h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {provider.baseURL.replace(/\/$/, "")}
            </p>
          </div>
          {isActive && (
            <span className="ml-auto shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              当前提供商
            </span>
          )}
        </div>

        <div className="mt-6 space-y-5">
          <Field label="名称">
            <input
              type="text"
              value={provider.name}
              disabled={provider.builtin}
              onChange={(e) => updateProvider({ name: e.target.value })}
              className={inputCls}
              placeholder="提供商名称"
            />
          </Field>

          <Field label="Base URL" hint="OpenAI 兼容接口地址，通常以 /v1 结尾">
            <input
              type="text"
              value={provider.baseURL}
              onChange={(e) => updateProvider({ baseURL: e.target.value })}
              className={inputCls}
              placeholder="https://api.example.com/v1"
            />
          </Field>

          <Field
            label="API Key"
            hint="仅保存在你浏览器的 localStorage 中，请求时只发送给你配置的提供商。"
          >
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={provider.apiKey}
                onChange={(e) => updateProvider({ apiKey: e.target.value })}
                className={`${inputCls} pr-10`}
                placeholder="sk-..."
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                title={showKey ? "隐藏" : "显示"}
              >
                <IconEye width={18} height={18} />
              </button>
            </div>
          </Field>

          <Field label="模型列表" hint="用逗号分隔，对话时可在其中选择">
            <input
              type="text"
              value={modelNames}
              onChange={(e) => handleModelsChange(e.target.value)}
              className={inputCls}
              placeholder="model-a, model-b"
            />
          </Field>

          <Field
            label="生图模型"
            hint="走 OpenAI 兼容 /images/generations 接口；留空则该提供商不支持图片生成（内置预设：OpenAI=gpt-image-2，Gemini=imagen-4.0-generate-001）"
          >
            <input
              type="text"
              value={provider.imageModel ?? ""}
              onChange={(e) => updateProvider({ imageModel: e.target.value.trim() || undefined })}
              className={inputCls}
              placeholder="如 gpt-image-2"
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              persist(settings);
              logActivity("settings", "保存提供商配置", provider.name);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            <IconCheck width={15} height={15} strokeWidth={2.6} />
            保存配置
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
          >
            {testing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-orange-600" />
                测试中…
              </>
            ) : (
              "测试连接"
            )}
          </button>
          {!isActive && (
            <button
              type="button"
              onClick={handleSetActive}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
            >
              设为当前提供商
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg px-4 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          >
            恢复默认
          </button>
        </div>

        {testResult && (
          <p
            className={`mt-3 rounded-lg px-3.5 py-2.5 text-sm ${
              testResult.ok
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            }`}
          >
            {testResult.ok ? "✅" : "⚠️"} {testResult.message}
          </p>
        )}
      </div>

        <QuickSettingsSection />
        <DataMigration />
        <McpServersSection />
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950/60 dark:disabled:bg-zinc-900";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-xs text-zinc-400 dark:text-zinc-500">{hint}</span>
      )}
    </label>
  );
}

/** 效率设置：桌面通知等交互增强 */
function QuickSettingsSection() {
  const settings = useAppSettings();
  const enabled = settings.notifyOnDone === true;
  const supported = notificationsSupported();

  const toggle = async () => {
    if (enabled) {
      updateAppSettings({ ...settings, notifyOnDone: false });
      logActivity("settings", "关闭完成通知");
      return;
    }
    const granted = await requestNotifyPermission();
    if (granted) {
      updateAppSettings({ ...settings, notifyOnDone: true });
      toast.success("已开启：回答完成时（页面在后台）发送桌面通知");
      logActivity("settings", "开启完成通知");
    } else {
      toast.error("浏览器未授予通知权限，请检查浏览器站点权限设置");
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/15 text-lg">
          ⚡
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">效率</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            交互增强开关，帮助你在等待回答时安心做别的事。
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-200 px-3.5 py-2.5 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!supported}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            enabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
          }`}
          title={
            supported
              ? enabled
                ? "已开启，点击关闭"
                : "已关闭，点击开启（首次会请求浏览器通知权限）"
              : "当前浏览器不支持桌面通知"
          }
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">回答完成时桌面通知</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            仅在本页处于后台时提醒，点击通知回到 AIDesk；实际行为受浏览器站点权限控制。
          </p>
        </div>
      </div>
    </div>
  );
}

/** MCP 服务器管理：对话中开启「🔧 工具」时，模型可调用这里启用的服务器 */
function McpServersSection() {
  const settings = useAppSettings();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"http" | "stdio">("http");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("");

  const servers = settings.mcpServers;

  const update = (next: McpServerConfig[]) => {
    updateAppSettings({ ...settings, mcpServers: next });
  };

  const toggle = (id: string) => {
    update(servers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const remove = (id: string) => {
    update(servers.filter((s) => s.id !== id));
  };

  const add = () => {
    if (!name.trim()) return;
    const targetOk = type === "http" ? !!url.trim() : !!command.trim();
    if (!targetOk) return;
    const server: McpServerConfig = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type,
      enabled: true,
      ...(type === "http"
        ? { url: url.trim() }
        : { command: command.trim(), args: args.split(/\s+/).filter(Boolean) }),
    };
    update([...servers, server]);
    setShowForm(false);
    setName("");
    setUrl("");
    setCommand("npx");
    setArgs("");
    logActivity("settings", "添加 MCP 服务器", server.name);
  };

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-none">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-lg">
          🔧
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">MCP 服务器</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            对话中开启「🔧 工具」后，模型可调用这些服务器提供的工具。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-400 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-amber-400"
        >
          {showForm ? "收起" : "添加服务器"}
        </button>
      </div>

      {servers.length > 0 && (
        <div className="mt-4 space-y-2">
          {servers.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3.5 py-2.5 dark:border-zinc-800"
            >
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  s.enabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
                title={s.enabled ? "已启用，点击停用" : "已停用，点击启用"}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    s.enabled ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                  <span
                    className={`mr-1.5 rounded px-1 py-0.5 text-[10px] font-medium ${
                      s.type === "stdio"
                        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        : "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                    }`}
                  >
                    {s.type === "stdio" ? "本地进程" : "HTTP"}
                  </span>
                  {s.type === "http" ? s.url : `${s.command} ${(s.args ?? []).join(" ")}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-500"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="mt-4 space-y-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <Field label="名称">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="如：文件系统 / 天气"
            />
          </Field>
          <Field label="连接方式">
            <div className="flex gap-2">
              {(["http", "stdio"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    type === t
                      ? "border-amber-500/60 bg-amber-500/10 font-medium text-orange-600 dark:text-amber-400"
                      : "border-zinc-300 text-zinc-600 hover:border-amber-400 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {t === "http" ? "HTTP（远程地址）" : "stdio（本地命令）"}
                </button>
              ))}
            </div>
          </Field>
          {type === "http" ? (
            <Field label="服务器地址" hint="Streamable HTTP MCP 端点，如 https://example.com/mcp">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={inputCls}
                placeholder="https://…/mcp"
              />
            </Field>
          ) : (
            <>
              <Field label="启动命令" hint="如 npx（更多服务器见 modelcontextprotocol.io/servers）">
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className={inputCls}
                  placeholder="npx"
                />
              </Field>
              <Field label="命令参数" hint="空格分隔，如：-y @modelcontextprotocol/server-filesystem /tmp">
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  className={inputCls}
                  placeholder="-y <包名>"
                />
              </Field>
            </>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={add}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
            >
              添加
            </button>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              ⚠️ stdio 服务器等于在本机执行你配置的命令，请只添加可信来源。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
