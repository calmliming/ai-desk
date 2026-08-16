import { useSyncExternalStore } from "react";

/**
 * 跨页面传递内容（提示词库/项目 → 对话/工具），仅会话内存，不持久化。
 * content：预填到输入框的内容；sessionId：打开对话页后自动选中的会话。
 */
export interface TransferPayload {
  content?: string;
  sessionId?: string;
  nonce: number;
}

let current: TransferPayload | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): TransferPayload | null {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTransfer(): TransferPayload | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function setTransfer(content?: string, sessionId?: string): void {
  current = { content, sessionId, nonce: (current?.nonce ?? 0) + 1 };
  listeners.forEach((listener) => listener());
}

export function clearTransfer(): void {
  current = null;
  listeners.forEach((listener) => listener());
}
