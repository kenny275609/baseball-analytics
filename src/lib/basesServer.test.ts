import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRunnersInDb } from '@/lib/basesServer';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = uuid(1);
const B = uuid(2);
const BATTER = uuid(9);
const GAME = uuid(100);

type Row = { play_id: string; inning: number; runner_player_id: string | null; from_base: number; to_base: number | null };

// 模擬 supabase.from().select().eq().eq().order().order()，記下呼叫方便檢查查詢條件與排序
function mockClient(result: { data: Row[] | null; error: { code?: string; message?: string } | null }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const client = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const row = (play: string, playerId: string | null, from: number, to: number | null): Row => ({
  play_id: play,
  inning: 3,
  runner_player_id: playerId,
  from_base: from,
  to_base: to,
});

const r = (playerId: string | null, from: number, to: number | null) => ({
  runner_player_id: playerId,
  from_base: from,
  to_base: to,
});

describe('checkRunnersInDb', () => {
  it('查詢該場該局事件，依 created_at、id 穩定排序', async () => {
    const { client, calls } = mockClient({ data: [], error: null });
    await checkRunnersInDb(client, GAME, 3, [r(BATTER, 0, 1)]);
    expect(calls).toEqual([
      { method: 'from', args: ['runner_events'] },
      { method: 'select', args: ['play_id, inning, runner_player_id, from_base, to_base'] },
      { method: 'eq', args: ['game_id', GAME] },
      { method: 'eq', args: ['inning', 3] },
      { method: 'order', args: ['created_at'] },
      { method: 'order', args: ['id'] },
    ]);
  });

  it('重播多個 play 後跑者在壘上且全部送到時通過', async () => {
    // A 一壘安打、B 一壘安打（A 上二壘）
    const data = [row('p1', A, 0, 1), row('p2', B, 0, 1), row('p2', A, 1, 2)];
    const { client } = mockClient({ data, error: null });
    expect(await checkRunnersInDb(client, GAME, 3, [r(BATTER, 0, 1), r(B, 1, 2), r(A, 2, 3)])).toEqual({ kind: 'ok' });
  });

  it('畫面過期（資料庫壘上有人但沒送到）回 invalid', async () => {
    const { client } = mockClient({ data: [row('p1', A, 0, 1)], error: null });
    const check = await checkRunnersInDb(client, GAME, 3, [r(BATTER, 0, null)]);
    expect(check.kind).toBe('invalid');
    expect(check.kind === 'invalid' && check.error).toMatch('重新整理');
  });

  it('送來的跑者不在壘上回 invalid', async () => {
    const { client } = mockClient({ data: [row('p1', A, 0, 2)], error: null });
    const check = await checkRunnersInDb(client, GAME, 3, [r(BATTER, 0, 1), r(A, 1, 2)]);
    expect(check).toMatchObject({ kind: 'invalid', error: expect.stringMatching('1 壘目前沒有跑者') });
  });

  it('資料表不存在（42P01 / PGRST205）回 missing', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      const { client } = mockClient({ data: null, error: { code } });
      expect(await checkRunnersInDb(client, GAME, 3, [r(BATTER, 0, 1)])).toEqual({ kind: 'missing' });
    }
  });

  it('其他讀取錯誤回 failed 並帶上原始錯誤', async () => {
    const error = { code: '500', message: 'boom' };
    const { client } = mockClient({ data: null, error });
    expect(await checkRunnersInDb(client, GAME, 3, [r(BATTER, 0, 1)])).toEqual({ kind: 'failed', error });
  });
});
