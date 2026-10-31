import { describe, expect, it } from 'vitest';
import { MAX_CACHED_GAMES, clearCachedGames, patchCachedGame, readCachedGame, saveCachedGame } from '@/lib/gameCache';
import { buildAtbatItem } from '@/lib/offlineQueue';
import type { KeyValueStorage, QueueItem } from '@/lib/offlineQueue';

function memoryStorage(): KeyValueStorage & { keys: () => string[] } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    keys: () => [...m.keys()],
  };
}

const data = (id: string) => ({ game: { id }, lineup: [], atbats: [], runner_events: [], innings: [] });

describe('gameCache', () => {
  it('存取最近開過的比賽，只留最近 5 場', () => {
    const s = memoryStorage();
    for (let i = 0; i < MAX_CACHED_GAMES + 2; i++) saveCachedGame(s, `g${i}`, data(`g${i}`));
    expect(readCachedGame(s, 'g0')).toBeNull();
    expect(readCachedGame(s, 'g1')).toBeNull();
    expect(readCachedGame(s, `g${MAX_CACHED_GAMES + 1}`)).toEqual(data(`g${MAX_CACHED_GAMES + 1}`));
  });

  it('壞掉的資料當作沒有快取；登出時全部清掉，不動離線佇列', () => {
    const s = memoryStorage();
    s.setItem('bk:game-cache:bad', '{oops');
    expect(readCachedGame(s, 'bad')).toBeNull();
    saveCachedGame(s, 'g1', data('g1'));
    s.setItem('bk:offline-queue:g1', '[]');
    clearCachedGames(s);
    expect(readCachedGame(s, 'g1')).toBeNull();
    expect(s.getItem('bk:offline-queue:g1')).toBe('[]');
  });

  it('空間不足時不丟出例外', () => {
    const s = memoryStorage();
    const full: KeyValueStorage = {
      ...s,
      length: 0,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveCachedGame(full, 'g1', data('g1'))).not.toThrow();
  });

  it('背景同步成功的紀錄接到快取上（離線再打開比賽頁不會少），沒有快取就不建立', () => {
    const s = memoryStorage();
    const item = buildAtbatItem(
      {
        gameId: 'g1', playerId: 'p1', player: null, battingOrder: 1, inning: 1, result: 'strikeout',
        quality: null, rbi: 0, hitX: null, hitY: null, note: '', moves: [], label: 'a',
      },
      'c1'
    );
    const synced = {
      atbat: { id: 'a1' },
      runner_events: [{ id: 'e1', play_id: 'c1', atbat_id: 'a1' }],
    };
    patchCachedGame(s, 'g1', item, synced);
    expect(readCachedGame(s, 'g1')).toBeNull();

    saveCachedGame(s, 'g1', data('g1'));
    patchCachedGame(s, 'g1', item, synced);
    patchCachedGame(s, 'g1', item, synced); // 重複接不會多一筆
    const cached = readCachedGame<ReturnType<typeof data>>(s, 'g1');
    expect(cached?.atbats).toEqual([{ id: 'a1' }]);
    expect(cached?.runner_events).toEqual([{ id: 'e1', play_id: 'c1', atbat_id: 'a1' }]);
    expect(cached?.game).toEqual({ id: 'g1' });

    // 撤銷同步後從快取拿掉
    patchCachedGame(s, 'g1', { ...item, kind: 'cancel' } as QueueItem, { deleted: 1 });
    expect(readCachedGame<ReturnType<typeof data>>(s, 'g1')?.atbats).toEqual([]);
  });
});
