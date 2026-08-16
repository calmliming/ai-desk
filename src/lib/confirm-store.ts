import { useSyncExternalStore } from "react";

/** 确认弹窗：Promise 风格，替代 window.confirm */

export interface ConfirmOptions {
  message: string;
  detail?: string;
  /** 确认按钮文案 */
  confirmLabel?: string;
  /** 危险操作（红色确认按钮） */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let state: ConfirmState | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): ConfirmState | null {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConfirmState(): ConfirmState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** 弹出确认框，返回用户选择（true=确认） */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    state = { ...options, resolve };
    listeners.forEach((l) => l());
  });
}

export function resolveConfirm(value: boolean): void {
  if (!state) return;
  const { resolve } = state;
  state = null;
  listeners.forEach((l) => l());
  resolve(value);
}
