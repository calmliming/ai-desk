import SettingsPanel from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">设置</h1>
        <p className="mt-1.5 text-zinc-600 dark:text-zinc-400">
          配置模型提供商与 API Key。密钥只保存在浏览器本地，不会写入代码或服务器。
        </p>
      </header>
      <SettingsPanel />
    </div>
  );
}
