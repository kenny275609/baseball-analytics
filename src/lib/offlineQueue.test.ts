import { beforeEach, describe, expect, it } from 'vitest';
import { RunnerEvent, RunnerMove, computeBases, outsInInning } from '@/lib/baserunning';
import {
  KeyValueStorage,
  MAX_SERVER_ERRORS,
  QueueItem,
  SendOutcome,
  buildAtbatItem,
  buildPlayItem,
  classifyResponse,
  clearBlock,
  enqueue,
  isPendingId,
  latestPending,
  mergePending,
  newClientId,
  pendingGameIds,
  readQueue,
  removeItem,
  requestFor,
  syncGame,
  undoLatestPending,
} from '@/lib/offlineQueue';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GAME = uuid(100);
const OTHER_GAME = uuid(200);
const P1 = uuid(1);
const P2 = uuid(2);
const P3 = uuid(3);

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

const ref = (name: string) => ({ name, number: null });

function atbatItem(n: number, moves: RunnerMove[], opts: { inning?: number; result?: string; order?: number } = {}) {
  return buildAtbatItem(
    {
      gameId: GAME,
      playerId: moves[0]?.playerId ?? P1,
      player: moves[0]?.player ?? ref('打者'),
      battingOrder: opts.order ?? 1,
      inning: opts.inning ?? 1,
      result: opts.result ?? 'single',
      quality: null,
      rbi: 0,
      hitX: null,
      hitY: null,
      note: '',
      moves,
      label: `打席 ${n}`,
    },
    uuid(1000 + n),
    `2026-11-01T10:00:0${n}.000Z`
  );
}

const batter = (id: string, to: number | null): RunnerMove => ({ playerId: id, player: ref(id), from: 0, to });
const runner = (id: string, from: number, to: number | null): RunnerMove => ({ playerId: id, player: ref(id), from, to });

// 模擬伺服器：記下收到的請求，依 client_id 去重（和 API 一樣）
function fakeServer(script: (item: QueueItem, call: number) => SendOutcome | 'write-then-drop' = () => ({ kind: 'ok', data: {} })) {
  const written = new Map<string, number>();
  const calls: string[] = [];
  const send = async (item: QueueItem): Promise<SendOutcome> => {
    calls.push(item.clientId);
    const outcome = script(item, calls.length);
    if (outcome === 'write-then-drop') {
      // 伺服器寫入了，但回應在路上斷掉
      written.set(item.clientId, (written.get(item.clientId) ?? 0) + 1);
      return { kind: 'network' };
    }
    if (outcome.kind === 'ok') {
      if (!written.has(item.clientId)) written.set(item.clientId, 1);
      return { kind: 'ok', data: { duplicate: (written.get(item.clientId) ?? 0) > 1, client_id: item.clientId } };
    }
    return outcome;
  };
  return { send, calls, written };
}

let storage: KeyValueStorage;
beforeEach(() => {
  storage = memoryStorage();
});

describe('佇列基本操作', () => {
  it('依加入順序保存，每場比賽分開', () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    const b = atbatItem(2, [batter(P2, 1), runner(P1, 1, 2)]);
    enqueue(storage, a);
    enqueue(storage, b);
    enqueue(storage, { ...atbatItem(3, [batter(P3, 1)]), gameId: OTHER_GAME });
    expect(readQueue(storage, GAME).map((i) => i.label)).toEqual(['打席 1', '打席 2']);
    expect(readQueue(storage, OTHER_GAME)).toHaveLength(1);
    expect(pendingGameIds(storage).sort()).toEqual([GAME, OTHER_GAME].sort());
  });

  it('同一個 client_id 只排一次（重複點擊）', () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    enqueue(storage, a);
    enqueue(storage, a);
    expect(readQueue(storage, GAME)).toHaveLength(1);
  });

  it('清空後移除 key；壞掉的 JSON 當作空佇列', () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    enqueue(storage, a);
    removeItem(storage, GAME, a.clientId);
    expect(storage.length).toBe(0);
    storage.setItem(`bk:offline-queue:${GAME}`, '{oops');
    expect(readQueue(storage, GAME)).toEqual([]);
  });

  it('newClientId 產生 UUID v4', () => {
    expect(newClientId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('建立佇列項目', () => {
  it('打席：body 帶 client_id 與完整跑者，預覽只含有移動的跑者', () => {
    const item = atbatItem(1, [batter(P1, 1), runner(P2, 2, 2), runner(P3, 3, 4)]);
    expect(item.body.client_id).toBe(item.clientId);
    expect(item.body.runners).toHaveLength(3);
    expect(item.preview.atbat.id).toBe(`pending:${item.clientId}`);
    expect(isPendingId(item.preview.atbat.id)).toBe(true);
    expect(item.preview.atbat).toMatchObject({ contacted: true, result: 'single', inning: 1, batting_order: 1 });
    expect(item.preview.events.map((e) => [e.from_base, e.to_base, e.event_type])).toEqual([
      [0, 1, 'batter'],
      [3, 4, 'runner'],
    ]);
    expect(item.preview.events.every((e) => e.play_id === item.clientId && e.atbat_id === item.preview.atbat.id)).toBe(true);
    expect(requestFor(item).url).toBe('/api/atbats/create');
  });

  it('跑壘 play：沒有 atbat_id，事件類型沿用選擇', () => {
    const item = buildPlayItem({ gameId: GAME, inning: 2, type: 'pickoff', moves: [runner(P1, 1, null)], label: '牽制' }, uuid(9));
    expect(item.preview.events).toEqual([
      expect.objectContaining({ atbat_id: null, play_id: uuid(9), from_base: 1, to_base: null, event_type: 'pickoff', inning: 2 }),
    ]);
    expect(requestFor(item)).toEqual({ url: '/api/runner-events/create', body: item.body });
  });
});

describe('合併畫面：伺服器資料 + 未同步紀錄', () => {
  const serverEvents: RunnerEvent[] = [
    {
      id: 's1', game_id: GAME, atbat_id: 'sa1', play_id: uuid(500), inning: 1,
      runner_player_id: P1, from_base: 0, to_base: 1, event_type: 'batter', created_at: '2026-11-01T09:00:00Z', players: null,
    },
  ];
  const serverAtbats = [{ id: 'sa1' }];

  it('未同步打席依序接在後面，壘包與出局數跟著算', () => {
    const q = [
      atbatItem(1, [batter(P2, 1), runner(P1, 1, 2)]),
      atbatItem(2, [batter(P3, null)], { result: 'strikeout' }),
    ];
    const m = mergePending(serverAtbats, serverEvents, q);
    expect(m.atbats.map((a) => a.id)).toEqual(['sa1', `pending:${q[0].clientId}`, `pending:${q[1].clientId}`]);
    const bases = computeBases(m.events, 1);
    expect(bases[1]?.playerId).toBe(P2);
    expect(bases[2]?.playerId).toBe(P1);
    expect(outsInInning(m.atbats as never, m.events, 1)).toBe(1);
  });

  it('已經寫入伺服器（重新載入後）但還在佇列的紀錄不重複顯示', () => {
    const item = atbatItem(1, [batter(P2, 1)]);
    const events = [...serverEvents, { ...serverEvents[0], id: 's2', atbat_id: 'sa2', play_id: item.clientId }];
    const m = mergePending([...serverAtbats, { id: 'sa2' }], events, [item]);
    expect(m.atbats.map((a) => a.id)).toEqual(['sa1', 'sa2']);
    expect(m.events).toHaveLength(2);
  });

  it('待送出的撤銷先把伺服器上的紀錄藏起來', () => {
    const cancel: QueueItem = {
      kind: 'cancel', clientId: uuid(500), gameId: GAME, label: '撤銷', queuedAt: '', attempted: false, serverErrors: 0, error: null,
    };
    const m = mergePending(serverAtbats, serverEvents, [cancel]);
    expect(m.atbats).toEqual([]);
    expect(m.events).toEqual([]);
  });
});

describe('同步', () => {
  it('依序一筆一筆送出，成功就移除', async () => {
    const items = [atbatItem(1, [batter(P1, 1)]), atbatItem(2, [batter(P2, 1)]), atbatItem(3, [batter(P3, 1)])];
    items.forEach((i) => enqueue(storage, i));
    const server = fakeServer();
    const synced: string[] = [];
    const result = await syncGame(storage, GAME, server.send, (item) => synced.push(item.clientId));
    expect(result).toEqual({ status: 'done', synced: 3 });
    expect(server.calls).toEqual(items.map((i) => i.clientId));
    expect(synced).toEqual(items.map((i) => i.clientId));
    expect(readQueue(storage, GAME)).toEqual([]);
  });

  it('網路失敗就停下，全部保留並標記可能已送出', async () => {
    const items = [atbatItem(1, [batter(P1, 1)]), atbatItem(2, [batter(P2, 1)])];
    items.forEach((i) => enqueue(storage, i));
    const server = fakeServer(() => ({ kind: 'network' }));
    const result = await syncGame(storage, GAME, server.send);
    expect(result).toEqual({ status: 'offline', synced: 0 });
    expect(server.calls).toEqual([items[0].clientId]);
    const q = readQueue(storage, GAME);
    expect(q.map((i) => i.clientId)).toEqual(items.map((i) => i.clientId));
    expect(q[0].attempted).toBe(true);
    expect(q[1].attempted).toBe(false);
  });

  it('send 丟出例外也當作網路失敗', async () => {
    enqueue(storage, atbatItem(1, [batter(P1, 1)]));
    const result = await syncGame(storage, GAME, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(result.status).toBe('offline');
    expect(readQueue(storage, GAME)).toHaveLength(1);
  });

  it('冪等：伺服器寫入後回應斷掉，重送用同一個 client_id，不會重複寫入', async () => {
    const item = atbatItem(1, [batter(P1, 1)]);
    enqueue(storage, item);
    const server = fakeServer((_, call) => (call === 1 ? 'write-then-drop' : { kind: 'ok', data: {} }));
    expect((await syncGame(storage, GAME, server.send)).status).toBe('offline');
    expect(server.written.get(item.clientId)).toBe(1);
    const result = await syncGame(storage, GAME, server.send);
    expect(result).toEqual({ status: 'done', synced: 1 });
    expect(server.calls).toEqual([item.clientId, item.clientId]);
    expect(server.written.get(item.clientId)).toBe(1);
    // 重送的 body 和第一次一模一樣（同一個 client_id）
    expect(item.body.client_id).toBe(item.clientId);
  });

  it('伺服器拒絕：停止這場比賽的同步，保留後面的紀錄並記下原因', async () => {
    const items = [atbatItem(1, [batter(P1, 1)]), atbatItem(2, [batter(P2, 1)]), atbatItem(3, [batter(P3, 1)])];
    items.forEach((i) => enqueue(storage, i));
    const server = fakeServer((item) =>
      item.clientId === items[1].clientId
        ? { kind: 'rejected', error: '1 壘有跑者但畫面上沒有，請重新整理後再記錄' }
        : { kind: 'ok', data: {} }
    );
    const result = await syncGame(storage, GAME, server.send);
    expect(result).toMatchObject({ status: 'blocked', synced: 1, error: expect.stringContaining('重新整理') });
    const q = readQueue(storage, GAME);
    expect(q.map((i) => i.clientId)).toEqual([items[1].clientId, items[2].clientId]);
    expect(q[0].error).toContain('重新整理');

    // 再同步也不會送出，直到使用者處理
    const again = await syncGame(storage, GAME, server.send);
    expect(again.status).toBe('blocked');
    expect(server.calls).toHaveLength(2);

    // 捨棄被拒絕的那筆後，後面的繼續送
    removeItem(storage, GAME, items[1].clientId);
    expect(await syncGame(storage, GAME, server.send)).toEqual({ status: 'done', synced: 1 });
    expect(server.calls.at(-1)).toBe(items[2].clientId);
  });

  it('按重試會清掉錯誤重新送出', async () => {
    const item = atbatItem(1, [batter(P1, 1)]);
    enqueue(storage, item);
    let reject = true;
    const send = async (): Promise<SendOutcome> => (reject ? { kind: 'rejected', error: 'x' } : { kind: 'ok', data: {} });
    expect((await syncGame(storage, GAME, send)).status).toBe('blocked');
    reject = false;
    clearBlock(storage, GAME);
    expect(await syncGame(storage, GAME, send)).toEqual({ status: 'done', synced: 1 });
  });

  it('伺服器內部錯誤先重試，連續失敗才暫停', async () => {
    enqueue(storage, atbatItem(1, [batter(P1, 1)]));
    const send = async (): Promise<SendOutcome> => ({ kind: 'server', error: 'Failed to create atbat' });
    for (let i = 1; i < MAX_SERVER_ERRORS; i++) {
      expect((await syncGame(storage, GAME, send)).status).toBe('retry');
    }
    expect((await syncGame(storage, GAME, send)).status).toBe('blocked');
    expect(readQueue(storage, GAME)[0].error).toBe('Failed to create atbat');
  });

  it('登入過期：保留紀錄、稍後再試，不會擋住', async () => {
    enqueue(storage, atbatItem(1, [batter(P1, 1)]));
    const result = await syncGame(storage, GAME, async () => ({ kind: 'auth', error: '登入已過期' }));
    expect(result).toMatchObject({ status: 'retry' });
    expect(readQueue(storage, GAME)[0].error).toBeNull();
  });

  it('同步途中新記錄的紀錄排在後面，同一輪接著送', async () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    const b = atbatItem(2, [batter(P2, 1)]);
    enqueue(storage, a);
    const server = fakeServer((item) => {
      if (item.clientId === a.clientId) enqueue(storage, b);
      return { kind: 'ok', data: {} };
    });
    expect(await syncGame(storage, GAME, server.send)).toEqual({ status: 'done', synced: 2 });
    expect(server.calls).toEqual([a.clientId, b.clientId]);
  });

  it('同一場比賽同時只有一個同步在跑，不會重複送出', async () => {
    enqueue(storage, atbatItem(1, [batter(P1, 1)]));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls: string[] = [];
    const send = async (item: QueueItem): Promise<SendOutcome> => {
      calls.push(item.clientId);
      await gate;
      return { kind: 'ok', data: {} };
    };
    const first = syncGame(storage, GAME, send);
    const second = await syncGame(storage, GAME, send);
    expect(second.status).toBe('busy');
    release();
    expect(await first).toEqual({ status: 'done', synced: 1 });
    expect(calls).toHaveLength(1);
  });
});

describe('撤銷未同步的紀錄', () => {
  it('送出途中按撤銷：送出成功後不會把撤銷請求一起刪掉，接著送出撤銷', async () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    enqueue(storage, a);
    const calls: string[] = [];
    const send = async (item: QueueItem): Promise<SendOutcome> => {
      calls.push(item.kind);
      if (item.kind === 'atbat') expect(undoLatestPending(storage, GAME).kind).toBe('cancelQueued');
      return { kind: 'ok', data: {} };
    };
    expect(await syncGame(storage, GAME, send)).toEqual({ status: 'done', synced: 2 });
    expect(calls).toEqual(['atbat', 'cancel']);
    expect(readQueue(storage, GAME)).toEqual([]);
  });

  it('送出途中按撤銷、伺服器拒絕原本那筆：撤銷請求不會被標成錯誤', async () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    enqueue(storage, a);
    const send = async (item: QueueItem): Promise<SendOutcome> => {
      if (item.kind === 'atbat') {
        undoLatestPending(storage, GAME);
        return { kind: 'rejected', error: 'stale' };
      }
      return { kind: 'ok', data: { deleted: 0 } };
    };
    expect(await syncGame(storage, GAME, send)).toEqual({ status: 'done', synced: 1 });
  });

  it('從沒送出的最後一筆直接移除', () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    const b = atbatItem(2, [batter(P2, 1)]);
    enqueue(storage, a);
    enqueue(storage, b);
    const r = undoLatestPending(storage, GAME);
    expect(r).toMatchObject({ kind: 'dropped', item: { clientId: b.clientId } });
    expect(readQueue(storage, GAME).map((i) => i.clientId)).toEqual([a.clientId]);
  });

  it('送出過但沒收到回應的改成撤銷請求（伺服器可能已寫入）', async () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    enqueue(storage, a);
    await syncGame(storage, GAME, async () => ({ kind: 'network' }));
    const r = undoLatestPending(storage, GAME);
    expect(r.kind).toBe('cancelQueued');
    const q = readQueue(storage, GAME);
    expect(q).toEqual([expect.objectContaining({ kind: 'cancel', clientId: a.clientId })]);
    expect(requestFor(q[0])).toEqual({ url: '/api/games/undo', body: { game_id: GAME, client_id: a.clientId } });
    // 畫面上不再顯示這筆
    expect(mergePending([], [], q).atbats).toEqual([]);
    expect(latestPending(q)).toBeNull();
    expect(undoLatestPending(storage, GAME)).toEqual({ kind: 'cancelsOnly' });
  });

  it('被伺服器拒絕的紀錄沒有寫入，撤銷直接移除並解除暫停', async () => {
    const a = atbatItem(1, [batter(P1, 1)]);
    enqueue(storage, a);
    await syncGame(storage, GAME, async () => ({ kind: 'rejected', error: 'stale' }));
    expect(undoLatestPending(storage, GAME)).toMatchObject({ kind: 'dropped' });
    expect(readQueue(storage, GAME)).toEqual([]);
  });

  it('佇列是空的：改撤銷伺服器上的紀錄', () => {
    expect(undoLatestPending(storage, GAME)).toEqual({ kind: 'none' });
  });
});

describe('classifyResponse', () => {
  it.each([
    [null, null, 'network'],
    [201, { atbat: {} }, 'ok'],
    [200, null, 'network'], // 公共 Wi-Fi 登入頁之類
    [401, { error: '請先登入' }, 'auth'],
    [400, { error: '1 壘目前沒有跑者' }, 'rejected'],
    [403, { error: '權限不足' }, 'rejected'],
    [409, { error: '識別碼已被使用' }, 'rejected'],
    [503, { error: '跑壘資料表尚未建立' }, 'rejected'],
    [503, null, 'network'],
    [502, null, 'network'],
    [504, { error: 'timeout' }, 'network'],
    [429, null, 'network'],
    [500, { error: 'Failed to create atbat' }, 'server'],
  ])('%s %j → %s', (status, data, kind) => {
    expect(classifyResponse(status, data).kind).toBe(kind);
  });

  it('拒絕時帶伺服器的錯誤訊息', () => {
    expect(classifyResponse(400, { error: '請重新整理' })).toEqual({ kind: 'rejected', error: '請重新整理' });
    expect(classifyResponse(422, {})).toEqual({ kind: 'rejected', error: '伺服器拒絕這筆紀錄（422）' });
  });
});
