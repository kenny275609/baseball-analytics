import { describe, expect, it } from 'vitest';
import { MAX_CACHED_GAMES, clearCachedGames, readCachedGame, saveCachedGame } from '@/lib/gameCache';
import type { KeyValueStorage } from '@/lib/offlineQueue';

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
});
