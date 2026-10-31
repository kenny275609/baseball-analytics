// 最近開過的比賽資料存在手機上：離線時從比賽列表切回比賽頁，還能看到壘包/打序並繼續記錄
// （畫面上會提示是上次載入的資料；紀錄照樣進離線佇列，連線後伺服器會檢查衝突）
import { applySynced } from '@/lib/offlineQueue';
import type { KeyValueStorage, QueueItem } from '@/lib/offlineQueue';
import type { RunnerEvent } from '@/lib/baserunning';

const PREFIX = 'bk:game-cache:';
const INDEX_KEY = 'bk:game-cache-index';
export const MAX_CACHED_GAMES = 5;

function readIndex(storage: KeyValueStorage): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(INDEX_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// 存不進去（空間不足）就算了，不影響記錄；離線佇列比快取重要，先刪掉最舊的快取
export function saveCachedGame(storage: KeyValueStorage, gameId: string, data: unknown): void {
  const index = [gameId, ...readIndex(storage).filter((id) => id !== gameId)];
  for (const old of index.slice(MAX_CACHED_GAMES)) {
    try {
      storage.removeItem(PREFIX + old);
    } catch {
      // 忽略
    }
  }
  try {
    storage.setItem(PREFIX + gameId, JSON.stringify(data));
    storage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, MAX_CACHED_GAMES)));
  } catch {
    try {
      storage.removeItem(PREFIX + gameId);
    } catch {
      // 忽略
    }
  }
}

export function readCachedGame<T>(storage: KeyValueStorage, gameId: string): T | null {
  try {
    const raw = storage.getItem(PREFIX + gameId);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && parsed.game ? (parsed as T) : null;
  } catch {
    return null;
  }
}

// 離線紀錄同步成功（可能不在比賽頁、或之後重新載入失敗）：把伺服器回傳的紀錄接到快取上，
// 之後離線打開比賽頁才不會少掉已上傳的紀錄。沒有快取就不用處理
export function patchCachedGame(
  storage: KeyValueStorage,
  gameId: string,
  item: QueueItem,
  data: Record<string, unknown>
): void {
  const cached = readCachedGame<{ atbats?: { id: string }[]; runner_events?: RunnerEvent[] }>(storage, gameId);
  if (!cached || !Array.isArray(cached.atbats)) return;
  const applied = applySynced(cached.atbats, cached.runner_events ?? [], item, data);
  try {
    storage.setItem(PREFIX + gameId, JSON.stringify({ ...cached, atbats: applied.atbats, runner_events: applied.events }));
  } catch {
    // 存不進去：刪掉過期的快取，避免離線時顯示少了紀錄的舊資料
    try {
      storage.removeItem(PREFIX + gameId);
    } catch {
      // 忽略
    }
  }
}

// 登出時清掉，共用手機不留上一個帳號看過的比賽
export function clearCachedGames(storage: KeyValueStorage): void {
  try {
    for (const id of readIndex(storage)) storage.removeItem(PREFIX + id);
    storage.removeItem(INDEX_KEY);
  } catch {
    // 忽略
  }
}
