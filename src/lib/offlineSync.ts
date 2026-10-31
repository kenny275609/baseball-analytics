'use client';

// 瀏覽器端的離線同步：佇列存在 localStorage，連線恢復 / App 打開 / 回到前景時依序送出
import { useEffect, useState } from 'react';
import {
  KeyValueStorage,
  QueueItem,
  SendOutcome,
  SyncResult,
  classifyResponse,
  enqueue,
  pendingGameIds,
  readQueue,
  requestFor,
  syncGame,
} from '@/lib/offlineQueue';

export type SyncEvent =
  | { type: 'change'; gameId: string | null }
  | { type: 'synced'; gameId: string; item: QueueItem; data: Record<string, unknown> }
  | { type: 'status'; gameId: string; status: SyncStatus };

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | Exclude<SyncResult, { status: 'busy' }>;

// localStorage 不能用時（例如隱私模式寫滿）退回記憶體，至少同一頁面內還能排隊
const memory = new Map<string, string>();
const memoryStorage: KeyValueStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
  key: (i) => [...memory.keys()][i] ?? null,
  get length() {
    return memory.size;
  },
};

export function queueStorage(): KeyValueStorage {
  try {
    const s = window.localStorage;
    s.setItem('bk:probe', '1');
    s.removeItem('bk:probe');
    return s;
  } catch {
    return memoryStorage;
  }
}

const listeners = new Set<(e: SyncEvent) => void>();
const statuses = new Map<string, SyncStatus>();

function emit(e: SyncEvent) {
  if (e.type === 'status') statuses.set(e.gameId, e.status);
  for (const l of listeners) l(e);
}

export function subscribe(listener: (e: SyncEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyChange(gameId: string | null) {
  emit({ type: 'change', gameId });
}

export function getStatus(gameId: string): SyncStatus {
  return statuses.get(gameId) ?? { state: 'idle' };
}

export function addToQueue(item: QueueItem) {
  enqueue(queueStorage(), item);
  notifyChange(item.gameId);
}

async function sendItem(item: QueueItem): Promise<SendOutcome> {
  const { url, body } = requestFor(item);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // 手機訊號差時不要一直卡著，逾時當作離線，之後再重送（client_id 去重）
      signal: AbortSignal.timeout?.(20000),
    });
  } catch {
    return classifyResponse(null, null);
  }
  const data = await res.json().catch(() => null);
  return classifyResponse(res.status, data);
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export async function runSync(gameId: string): Promise<SyncResult> {
  const storage = queueStorage();
  if (readQueue(storage, gameId).length === 0) {
    const done: SyncResult = { status: 'done', synced: 0 };
    emit({ type: 'status', gameId, status: done });
    return done;
  }
  if (!isOnline()) {
    const offline: SyncResult = { status: 'offline', synced: 0 };
    emit({ type: 'status', gameId, status: offline });
    return offline;
  }
  const run = async (): Promise<SyncResult> => {
    emit({ type: 'status', gameId, status: { state: 'syncing' } });
    const result = await syncGame(storage, gameId, sendItem, (item, data) => {
      emit({ type: 'synced', gameId, item, data });
      notifyChange(gameId);
    });
    if (result.status !== 'busy') emit({ type: 'status', gameId, status: result });
    notifyChange(gameId);
    return result;
  };
  // 同一支手機開了兩個分頁時，用 Web Locks 讓同一場比賽只有一個分頁在送
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return run();
  return locks.request(`bk-sync-${gameId}`, { ifAvailable: true }, async (lock) =>
    lock ? run() : ({ status: 'busy', synced: 0 } as const)
  );
}

export async function syncAll(): Promise<void> {
  for (const gameId of pendingGameIds(queueStorage())) {
    await runSync(gameId);
  }
}

// 比賽頁用：這場比賽的佇列與同步狀態，跟著佇列變動與其他分頁更新
export function usePendingQueue(gameId: string): { items: QueueItem[]; status: SyncStatus } {
  const [state, setState] = useState<{ items: QueueItem[]; status: SyncStatus }>({
    items: [],
    status: { state: 'idle' },
  });
  useEffect(() => {
    const refresh = () => setState({ items: readQueue(queueStorage(), gameId), status: getStatus(gameId) });
    refresh();
    const unsubscribe = subscribe((e) => {
      if (e.type === 'synced') return;
      if (e.gameId === null || e.gameId === gameId) refresh();
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('bk:offline-queue:')) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [gameId]);
  return state;
}

// 佇列項目被手動移除後，清掉舊的同步錯誤訊息
export function resetStatus(gameId: string) {
  emit({ type: 'status', gameId, status: { state: 'idle' } });
}
