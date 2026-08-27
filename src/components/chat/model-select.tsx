"use client";

import { useAppSettings } from "@/lib/settings-store";
import { isVisionModel } from "@/lib/providers";
import Select from "@/components/ui/select";

export default function ModelSelect({
  providerId,
  model,
  onProviderChange,
  onModelChange,
}: {
  providerId: string;
  model: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (model: string) => void;
}) {
  const settings = useAppSettings();
  const providers = Object.values(settings.providers);
  const provider = settings.providers[providerId] ?? providers[0];
  const models = provider?.models ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={providerId}
        onChange={(e) => onProviderChange(e.target.value)}
        title="提供商"
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.apiKey ? "" : " · 未配置 Key"}
          </option>
        ))}
      </Select>
      <Select
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        title="模型"
      >
        {models.length === 0 && <option value="">请先配置模型列表</option>}
        {model && !models.includes(model) && <option value={model}>{model}</option>}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
            {isVisionModel(providerId, m) ? " · 视觉" : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}
