/** 桌面通知：浏览器 Notification API 的薄封装 */

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** 请求通知权限；返回最终是否可用 */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

/** 发送一条「回答完成」通知；点击通知回到本页 */
export function notifyComplete(title: string, body?: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(`AIDesk · ${title}`, {
      body: body?.slice(0, 120) || "回答已生成完成",
      tag: "aidesk-done",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // 部分平台（如 iOS 非 PWA 环境）不支持，静默忽略
  }
}
