import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/baserunning';
import { CONFLICT_ERROR, ExpectedLast, checkExpected, parseExpectedLast } from '@/lib/conflict';
import { checkExpectedInDb } from '@/lib/conflictServer';
import { KeyValueStorage, QueueItem, buildAtbatItem, buildPlayItem, enqueue, expectedLastFor, readQueue, undoLatestPending } from '@/lib/offlineQueue';
import { UndoRequest, latestAction } from '@/lib/undo';
import type { RunnerEvent } from '@/lib/baserunning';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GAME = uuid(100);
const C = uuid(3);
const AB_X = uuid(10);
const AB_Y = uuid(11);
const PLAY = uuid(20);
const CLIENT = uuid(30);

const noClient = async () => null;

function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

const atbat = (id: string, at: string) => ({ id, created_at: at });
const event = (id: string, playId: string, atbatId: string | null, at: string): RunnerEvent => ({
  id,
  game_id: GAME,
  atbat_id: atbatId,
  play_id: playId,
  inning: 1,
  runner_player_id: C,
  from_base: 0,
  to_base: null,
  event_type: 'batter',
  created_at: at,
  players: null,
});

describe('parseExpectedLast', () => {
  it('沒帶是 undefined（舊版前端不檢查），格式錯誤是 false', () => {
    expect(parseExpectedLast(undefined, isUuid)).toBeUndefined();
    expect(parseExpectedLast(null, isUuid)).toBe(false);
    expect(parseExpectedLast({ kind: 'atbat', id: 'x' }, isUuid)).toBe(false);
    expect(parseExpectedLast({ kind: 'what' }, isUuid)).toBe(false);
    expect(parseExpectedLast({ kind: 'none' }, isUuid)).toEqual({ kind: 'none' });
    expect(parseExpectedLast({ kind: 'atbat', id: AB_X }, isUuid)).toEqual({ kind: 'atbat', id: AB_X });
    expect(parseExpectedLast({ kind: 'play', play_id: PLAY }, isUuid)).toEqual({ kind: 'play', play_id: PLAY });
    expect(parseExpectedLast({ kind: 'client', client_id: CLIENT }, isUuid)).toEqual({ kind: 'client', client_id: CLIENT });
  });
});

describe('checkExpected', () => {
  it('伺服器最後一筆仍是記錄當下的最後一筆：通過', async () => {
    expect(await checkExpected({ kind: 'atbat', id: AB_X }, { kind: 'atbat', id: AB_X }, noClient)).toEqual({ ok: true });
    expect(await checkExpected({ kind: 'play', play_id: PLAY }, { kind: 'play', play_id: PLAY }, noClient)).toEqual({ ok: true });
    expect(await checkExpected({ kind: 'none' }, null, noClient)).toEqual({ ok: true });
  });

  it('跑者沒動的出局（壘上無人的滾地出局）：另一支手機先記了同一位打者 → 衝突', async () => {
    // A 離線時畫面上最後一筆是 X；B 在線上記了 C 的打席 Y
    const latest = latestAction([atbat(AB_X, '2026-10-31T10:00:00Z'), atbat(AB_Y, '2026-10-31T10:05:00Z')], []);
    const result = await checkExpected({ kind: 'atbat', id: AB_X }, latest, noClient);
    expect(result).toEqual({ ok: false, error: CONFLICT_ERROR });
  });

  it('比賽剛開始兩支手機都記第一棒：後到的衝突', async () => {
    expect(await checkExpected({ kind: 'none' }, { kind: 'atbat', id: AB_Y }, noClient)).toMatchObject({ ok: false });
  });

  it('前一筆最後一筆被撤銷（伺服器最後一筆變成更早的紀錄）也算衝突', async () => {
    expect(await checkExpected({ kind: 'atbat', id: AB_Y }, { kind: 'atbat', id: AB_X }, noClient)).toMatchObject({ ok: false });
  });

  it('前一筆是同一支手機排隊中的紀錄：以 client_id 找到伺服器上的那一筆再比較', async () => {
    const resolve = async (id: string): Promise<UndoRequest | null> => (id === CLIENT ? { kind: 'atbat', id: AB_X } : null);
    const expected: ExpectedLast = { kind: 'client', client_id: CLIENT };
    expect(await checkExpected(expected, { kind: 'atbat', id: AB_X }, resolve)).toEqual({ ok: true });
    // 中間被其他裝置插入一筆
    expect(await checkExpected(expected, { kind: 'atbat', id: AB_Y }, resolve)).toMatchObject({ ok: false });
  });

  it('前一筆排隊中的紀錄不在伺服器上（被捨棄）：衝突', async () => {
    expect(await checkExpected({ kind: 'client', client_id: CLIENT }, null, noClient)).toMatchObject({ ok: false });
  });
});

describe('expectedLastFor（前端記錄當下的前一筆）', () => {
  const storage = memoryStorage();
  const draft = (label: string) =>
    buildAtbatItem({
      gameId: GAME,
      playerId: C,
      player: null,
      battingOrder: 3,
      inning: 1,
      result: 'groundout',
      quality: null,
      rbi: 0,
      hitX: null,
      hitY: null,
      note: '',
      moves: [{ playerId: C, player: null, from: 0, to: null }],
      label,
    });

  it('沒有紀錄是 none；只有伺服器資料時是伺服器最後一筆（打席或跑壘 play）', () => {
    expect(expectedLastFor([], [], [])).toEqual({ kind: 'none' });
    const atbats = [atbat(AB_X, '2026-10-31T10:00:00Z')];
    expect(expectedLastFor(atbats, [], [])).toEqual({ kind: 'atbat', id: AB_X });
    const events = [event(uuid(50), PLAY, null, '2026-10-31T10:01:00Z')];
    expect(expectedLastFor(atbats, events, [])).toEqual({ kind: 'play', play_id: PLAY });
  });

  it('佇列裡有動作時是最後一筆排隊中的動作', () => {
    const first = draft('a');
    const second = buildPlayItem({ gameId: GAME, inning: 1, type: 'pickoff', moves: [], label: 'b' });
    expect(expectedLastFor([atbat(AB_X, '2026-10-31T10:00:00Z')], [], [first])).toEqual({ kind: 'client', client_id: first.clientId });
    expect(expectedLastFor([], [], [first, second])).toEqual({ kind: 'client', client_id: second.clientId });
  });

  it('待送出的撤銷：那一筆不算，前一筆退回它之前的紀錄', () => {
    const item = draft('x');
    enqueue(storage, { ...item, attempted: true });
    expect(undoLatestPending(storage, GAME).kind).toBe('cancelQueued');
    const queue: QueueItem[] = readQueue(storage, GAME);
    // 這筆其實已經寫進伺服器（AB_Y 帶著它的 play_id）
    const atbats = [atbat(AB_X, '2026-10-31T10:00:00Z'), atbat(AB_Y, '2026-10-31T10:05:00Z')];
    const events = [event(uuid(51), item.clientId, AB_Y, '2026-10-31T10:05:00Z')];
    expect(expectedLastFor(atbats, events, queue)).toEqual({ kind: 'atbat', id: AB_X });
  });

  it('送出的 body 帶 expected_last', () => {
    const expectedLast: ExpectedLast = { kind: 'atbat', id: AB_X };
    const a = buildAtbatItem({
      gameId: GAME,
      playerId: C,
      player: null,
      battingOrder: 3,
      inning: 1,
      result: 'groundout',
      quality: null,
      rbi: 0,
      hitX: null,
      hitY: null,
      note: '',
      moves: [],
      label: 'a',
      expectedLast,
    });
    expect(a.body.expected_last).toEqual(expectedLast);
    const p = buildPlayItem({ gameId: GAME, inning: 1, type: 'pickoff', moves: [], label: 'b', expectedLast });
    expect(p.body.expected_last).toEqual(expectedLast);
    expect('expected_last' in buildPlayItem({ gameId: GAME, inning: 1, type: 'pickoff', moves: [], label: 'b' }).body).toBe(false);
  });
});

// 依資料表依序回傳結果的假 supabase
function mockClient(results: Record<string, { data: unknown; error: { code?: string } | null }[]>) {
  const client = {
    from: (table: string) => {
      const result = results[table].shift();
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'is', 'limit']) builder[method] = () => builder;
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return builder;
    },
  } as unknown as SupabaseClient;
  return client;
}

describe('checkExpectedInDb', () => {
  it('伺服器最後一筆是其他裝置記的打席：衝突', async () => {
    const client = mockClient({
      atbats: [{ data: [atbat(AB_Y, '2026-10-31T10:05:00Z')], error: null }],
      runner_events: [{ data: [], error: null }],
    });
    expect(await checkExpectedInDb(client, GAME, { kind: 'atbat', id: AB_X })).toMatchObject({ ok: false });
  });

  it('前一筆排隊紀錄已同步且仍是最後一筆：通過', async () => {
    const client = mockClient({
      atbats: [{ data: [atbat(AB_X, '2026-10-31T10:05:00Z')], error: null }],
      runner_events: [
        { data: [], error: null }, // 最後一個非打擊跑壘
        { data: [{ atbat_id: AB_X }], error: null }, // client_id 對應的打席
      ],
    });
    expect(await checkExpectedInDb(client, GAME, { kind: 'client', client_id: CLIENT })).toEqual({ ok: true });
  });
});
