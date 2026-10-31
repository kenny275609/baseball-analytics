// 換人寫入/撤銷（伺服器端）：打序條件更新失敗時撤回換人紀錄、migration 未執行時回 503
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MIGRATION_ERROR, createSubstitution, undoSubstitution } from '@/lib/substitutionServer';
import type { SubstitutionInput } from '@/lib/substitution';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GAME = uuid(100);
const A = uuid(1);
const B = uuid(2);
const PH = uuid(8);
const SUB = uuid(50);

type Res = { data: unknown; error: { code?: string; message?: string } | null };
type Op = { table: string; op: string; calls: { method: string; args: unknown[] }[] };

// 假 supabase：依「資料表:動作」依序回傳腳本裡的結果，沒指定就回傳空資料；記下每次操作
function mockClient(script: Record<string, Res[]>) {
  const ops: Op[] = [];
  const client = {
    from: (table: string) => {
      const entry: Op = { table, op: 'select', calls: [] };
      ops.push(entry);
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'order', 'limit', 'maybeSingle', 'single']) {
        builder[method] = (...args: unknown[]) => {
          if (method === 'insert' || method === 'update' || method === 'delete') entry.op = method;
          entry.calls.push({ method, args });
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const single = entry.calls.some((c) => c.method === 'maybeSingle' || c.method === 'single');
        const result = script[`${table}:${entry.op}`]?.shift() ?? { data: single ? null : [], error: null };
        return Promise.resolve(result).then(resolve);
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, ops };
}

const input: SubstitutionInput = {
  client_id: uuid(70),
  game_id: GAME,
  sub_type: 'pinch_hitter',
  batting_order: 2,
  out_player_id: B,
  in_player_id: PH,
  inning: 3,
  half: 'top',
  base: null,
};

const live = { data: { id: GAME, status: 'live' }, error: null };
const lineup = { data: [{ batting_order: 1, player_id: A }, { batting_order: 2, player_id: B }], error: null };
const inserted = { data: { id: SUB, game_id: GAME, sub_type: 'pinch_hitter' }, error: null };

describe('createSubstitution', () => {
  it('寫入換人紀錄並以「這一棒仍是原球員」為條件更新打序', async () => {
    const { client, ops } = mockClient({
      'games:select': [live],
      'game_lineups:select': [lineup],
      'game_substitutions:insert': [inserted],
      'game_lineups:update': [{ data: [{ batting_order: 2 }], error: null }],
    });
    const result = await createSubstitution(client, input);
    expect(result).toMatchObject({ status: 201, body: { substitution: { id: SUB } } });
    const update = ops.find((o) => o.table === 'game_lineups' && o.op === 'update')!;
    expect(update.calls).toContainEqual({ method: 'update', args: [{ player_id: PH }] });
    expect(update.calls).toContainEqual({ method: 'eq', args: ['player_id', B] });
    expect(update.calls).toContainEqual({ method: 'eq', args: ['batting_order', 2] });
  });

  it('同一個 client_id 已寫入（重送）：回傳原本那筆，不重複換人', async () => {
    const { client, ops } = mockClient({
      'game_substitutions:select': [{ data: { id: SUB, game_id: GAME }, error: null }],
    });
    expect(await createSubstitution(client, input)).toMatchObject({ status: 200, body: { duplicate: true } });
    expect(ops.some((o) => o.op === 'insert' || o.op === 'update')).toBe(false);
  });

  it('migration 還沒執行：503 並提示要執行的檔案', async () => {
    const { client } = mockClient({ 'game_substitutions:select': [{ data: null, error: { code: 'PGRST205' } }] });
    expect(await createSubstitution(client, input)).toEqual({ status: 503, body: { error: MIGRATION_ERROR } });
  });

  it('打序已被其他裝置換掉：409，不寫入', async () => {
    const { client, ops } = mockClient({
      'games:select': [live],
      'game_lineups:select': [{ data: [{ batting_order: 2, player_id: A }], error: null }],
    });
    expect(await createSubstitution(client, input)).toMatchObject({ status: 409, body: { conflict: true } });
    expect(ops.some((o) => o.op === 'insert')).toBe(false);
  });

  it('寫入途中打序被搶先更新（條件更新 0 筆）：撤回換人紀錄並回 409', async () => {
    const { client, ops } = mockClient({
      'games:select': [live],
      'game_lineups:select': [lineup],
      'game_substitutions:insert': [inserted],
      'game_lineups:update': [{ data: [], error: null }],
    });
    expect(await createSubstitution(client, input)).toMatchObject({ status: 409 });
    const rollback = ops.find((o) => o.table === 'game_substitutions' && o.op === 'delete')!;
    expect(rollback.calls).toContainEqual({ method: 'eq', args: ['id', SUB] });
  });

  it('比賽已結束：不能換人', async () => {
    const { client } = mockClient({ 'games:select': [{ data: { id: GAME, status: 'final' }, error: null }] });
    expect(await createSubstitution(client, input)).toMatchObject({ status: 400 });
  });

  it('加棒次：新增一棒', async () => {
    const { client, ops } = mockClient({
      'games:select': [live],
      'game_lineups:select': [lineup],
      'game_substitutions:insert': [inserted],
      'game_lineups:insert': [{ data: [{ batting_order: 3 }], error: null }],
    });
    const add = { ...input, sub_type: 'add_slot' as const, out_player_id: null, batting_order: 3 };
    expect(await createSubstitution(client, add)).toMatchObject({ status: 201 });
    const insert = ops.find((o) => o.table === 'game_lineups' && o.op === 'insert')!;
    expect(insert.calls[0]).toEqual({ method: 'insert', args: [{ game_id: GAME, batting_order: 3, player_id: PH }] });
  });

  it('代跑：跑者不在那個壘包上就回 409', async () => {
    const { client } = mockClient({
      'games:select': [live],
      'game_lineups:select': [lineup],
      // 該局沒有跑壘事件：壘上沒人
      'runner_events:select': [{ data: [], error: null }],
    });
    const pr = { ...input, sub_type: 'pinch_runner' as const, base: 1 };
    expect(await createSubstitution(client, pr)).toMatchObject({ status: 409 });
  });
});

describe('undoSubstitution', () => {
  const row = { id: SUB, sub_type: 'pinch_hitter', batting_order: 2, out_player_id: B, in_player_id: PH };

  it('打序還原成原球員，再刪掉換人紀錄', async () => {
    const { client, ops } = mockClient({
      'game_substitutions:select': [{ data: row, error: null }],
      'game_lineups:update': [{ data: [{ batting_order: 2 }], error: null }],
      'game_substitutions:delete': [{ data: [{ id: SUB }], error: null }],
    });
    expect(await undoSubstitution(client, GAME, SUB)).toEqual({ ok: true });
    const update = ops.find((o) => o.table === 'game_lineups' && o.op === 'update')!;
    expect(update.calls).toContainEqual({ method: 'update', args: [{ player_id: B }] });
    expect(update.calls).toContainEqual({ method: 'eq', args: ['player_id', PH] });
  });

  it('加棒次的撤銷：移除那一棒', async () => {
    const { client, ops } = mockClient({
      'game_substitutions:select': [{ data: { ...row, sub_type: 'add_slot', out_player_id: null, batting_order: 10 }, error: null }],
      'game_lineups:delete': [{ data: [{ batting_order: 10 }], error: null }],
      'game_substitutions:delete': [{ data: [{ id: SUB }], error: null }],
    });
    expect(await undoSubstitution(client, GAME, SUB)).toEqual({ ok: true });
    expect(ops.find((o) => o.table === 'game_lineups' && o.op === 'delete')!.calls).toContainEqual({
      method: 'eq',
      args: ['batting_order', 10],
    });
  });

  it('這一棒已經不是換上場的球員：409，不刪換人紀錄', async () => {
    const { client, ops } = mockClient({
      'game_substitutions:select': [{ data: row, error: null }],
      'game_lineups:update': [{ data: [], error: null }],
    });
    expect(await undoSubstitution(client, GAME, SUB)).toMatchObject({ ok: false, status: 409 });
    expect(ops.some((o) => o.table === 'game_substitutions' && o.op === 'delete')).toBe(false);
  });

  it('換人紀錄刪不掉（沒有權限）：打序改回換人後的狀態', async () => {
    const { client, ops } = mockClient({
      'game_substitutions:select': [{ data: row, error: null }],
      'game_lineups:update': [{ data: [{ batting_order: 2 }], error: null }, { data: [{ batting_order: 2 }], error: null }],
      'game_substitutions:delete': [{ data: [], error: null }],
    });
    expect(await undoSubstitution(client, GAME, SUB)).toMatchObject({ ok: false, status: 403 });
    const updates = ops.filter((o) => o.table === 'game_lineups' && o.op === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[1].calls).toContainEqual({ method: 'update', args: [{ player_id: PH }] });
  });
});
