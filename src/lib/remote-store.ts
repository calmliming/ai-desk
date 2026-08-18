import { toast } from "./toast-store";

/**
 * 各 store 的持久化层：把原来的 localStorage 读写换成 /api/data/<resource>。
 *
 * 三条保护，都是为了防止「用空的内存态覆盖掉整库」：
 * - getSnapshot 必须同步返回，所以首屏先给空数组，hydrate 完成后再通知订阅者重渲染；
 *   期间若发生写操作，排队的是取数函数而不是那一刻的数组快照，
 *   真正发请求时才现取，保证送出去的一定是最新状态。
 * - 首次读取返回之前不发 PUT。
 * - 首次读取失败则永久禁写：宁可这次改动只留在内存里，也不能拿空状态抹掉数据库。
 *
 * 写入按 resource 去抖 + 串行：同一时刻只允许一个 PUT 在飞，
 * 避免快速连续操作把顺序写乱（后发的请求先到会覆盖成旧数据）。
 */

const DEBOUNCE_MS = 400;

interface Pending<T> {
  timer: number | null;
  inFlight: boolean;
  /** 待写入数据的取数函数；null 表示没有积压 */
  next: (() => T[]) | null;
  /** 首次读取是否完成、是否成功 */
  ready: Promise<void>;
  markReady: () => void;
  loaded: boolean;
}

const pending = new Map<string, Pending<unknown>>();

function slot<T>(resource: string): Pending<T> {
  let entry = pending.get(resource) as Pending<T> | undefined;
  if (!entry) {
    let markReady = () => {};
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    entry = { timer: null, inFlight: false, next: null, ready, markReady, loaded: false };
    pending.set(resource, entry as Pending<unknown>);
  }
  return entry;
}

/** 首次读取：失败时返回 null，由调用方决定回退（通常保留内存态） */
export async function hydrate<T>(resource: string): Promise<T[] | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`/api/data/${resource}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    slot<T>(resource).loaded = true;
    return data as T[];
  } catch (err) {
    console.error(`[store] 加载 ${resource} 失败`, err);
    toast.error("数据加载失败：本次改动不会写入数据库");
    return null;
  } finally {
    slot<T>(resource).markReady();
  }
}

async function flush<T>(resource: string): Promise<void> {
  const entry = slot<T>(resource);
  if (entry.inFlight || entry.next === null) return;

  // 先占住 in-flight 再 await，否则等待期间进来的 flush 会并发发出第二个 PUT
  entry.inFlight = true;
  try {
    // 等首次读取落地再写，避免「还没读到就先覆盖」
    await entry.ready;

    const getData = entry.next;
    entry.next = null;
    if (getData === null) return;

    // 读失败过就不再写：此时内存态可能是空的，写下去等于清库
    if (!entry.loaded) {
      console.warn(`[store] ${resource} 未成功加载，跳过写入`);
      return;
    }

    // 现取而不是用排队时的快照：期间 hydrate 可能刚把数据填进来
    const body = getData();

    const res = await fetch(`/api/data/${resource}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`[store] 保存 ${resource} 失败`, err);
    toast.error("保存失败，改动仅存在于当前页面");
  } finally {
    entry.inFlight = false;
    // 请求期间又有新状态积压，继续写下一轮
    if (entry.next !== null) void flush<T>(resource);
  }
}

/**
 * 去抖持久化：连续调用只会写一次，且写的是发请求那一刻 getData() 的结果。
 * 传函数而非数组，是为了不把过期的快照排进队列。
 */
export function persist<T>(resource: string, getData: () => T[]): void {
  if (typeof window === "undefined") return;
  const entry = slot<T>(resource);
  entry.next = getData;
  if (entry.timer !== null) window.clearTimeout(entry.timer);
  entry.timer = window.setTimeout(() => {
    entry.timer = null;
    void flush<T>(resource);
  }, DEBOUNCE_MS);
}
