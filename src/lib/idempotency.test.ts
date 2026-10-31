import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findExistingPlay, isUniqueViolation, parseClientId } from '@/lib/idempotency';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GAME = uuid(100);
const PLAY = uuid(7);

type Result = { data: unknown; error: { code?: string } | null };

// 每次 from(table) 依序回傳 results 裡對應資料表的結果
function mockClient(results: Record<string, Result>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const client = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order']) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.maybeSingle = () => Promise.resolve(results[table]);
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(results[table]).then(resolve);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('parseClientId', () => {
  it('沒帶是 null，格式錯誤是 false', () => {
    expect(parseClientId(undefined)).toBeNull();
    expect(parseClientId(null)).toBeNull();
    expect(parseClientId(PLAY)).toBe(PLAY);
    expect(parseClientId('abc')).toBe(false);
    expect(parseClientId(123)).toBe(false);
  });

  it('23505 是 unique 衝突', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '42P01' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('findExistingPlay', () => {
  it('沒寫過回傳 none，查詢限定這場比賽與 play_id', async () => {
    const { client, calls } = mockClient({ runner_events: { data: [], error: null } });
    expect(await findExistingPlay(client, GAME, PLAY)).toEqual({ kind: 'none' });
    expect(calls).toContainEqual({ table: 'runner_events', method: 'eq', args: ['game_id', GAME] });
    expect(calls).toContainEqual({ table: 'runner_events', method: 'eq', args: ['play_id', PLAY] });
  });

  it('打席已寫入：回傳原本的打席與跑壘', async () => {
    const events = [{ id: 'e1', atbat_id: 'a1', play_id: PLAY }];
    const { client } = mockClient({
      runner_events: { data: events, error: null },
      atbats: { data: { id: 'a1' }, error: null },
    });
    expect(await findExistingPlay(client, GAME, PLAY)).toEqual({ kind: 'atbat', atbat: { id: 'a1' }, events });
  });

  it('非打擊跑壘已寫入：回傳原本的事件', async () => {
    const events = [{ id: 'e1', atbat_id: null, play_id: PLAY }];
    const { client } = mockClient({ runner_events: { data: events, error: null } });
    expect(await findExistingPlay(client, GAME, PLAY)).toEqual({ kind: 'play', events });
  });

  it('跑壘資料表還沒建立：當作沒寫過', async () => {
    const { client } = mockClient({ runner_events: { data: null, error: { code: 'PGRST205' } } });
    expect(await findExistingPlay(client, GAME, PLAY)).toEqual({ kind: 'none' });
  });

  it('其他讀取錯誤往上丟', async () => {
    const { client } = mockClient({ runner_events: { data: null, error: { code: 'XX000' } } });
    await expect(findExistingPlay(client, GAME, PLAY)).rejects.toEqual({ code: 'XX000' });
  });
});
