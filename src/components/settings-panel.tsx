"use client";

import { useState } from "react";
import { IconCheck, IconEye, IconKey } from "./icons";
import { CUSTOM_PROVIDER, PROVIDER_PRESETS } from "@/lib/providers";
import { updateAppSettings, useAppSettings } from "@/lib/settings-store";
import type { AppSettings, ProviderConfig } from "@/lib/types";

export default function SettingsPanel() {
  const settings = useAppSettings();
  const [selectedId, setSelectedId] = useState<string>("deepseek");
  const [showKey, setShowKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const provider = settings.providers[selectedId];
  const isActive = settings.activeProviderId === selectedId;
  const modelNames = provider ? provider.models.join(", ") : "";

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
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleSetActive = () => {
    persist({ ...settings, activeProviderId: selectedId });
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
  };

  const handleModelsChange = (value: string) => {
    updateProvider({
      models: value
        .split(/[,，\n]/)
        .map((m) => m.trim())
        .filter(Boolean),
    });
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
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => persist(settings)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            <IconCheck width={15} height={15} strokeWidth={2.6} />
            保存配置
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
          {savedFlash && (
            <span className="ml-auto text-sm text-emerald-600 dark:text-emerald-400">
              ✓ 已保存到本机
            </span>
          )}
        </div>
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
