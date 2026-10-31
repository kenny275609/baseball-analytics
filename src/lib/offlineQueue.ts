// 離線記錄佇列（純邏輯，不碰 window；儲存位置由呼叫端傳入，測試用記憶體版）
//
// - 每場比賽一個佇列，依記錄順序保存「打席」「跑壘 play」「撤銷」三種動作
// - 每筆動作有前端產生的 client_id，伺服器當作 play_id；重送時伺服器先查這個 play_id，
//   已經寫入過就直接回傳原本的資料，不會重複記錄
// - 同步一律依序、一次一筆；伺服器拒絕（例如畫面過期的 400）就停下這場比賽的同步，
//   保留後面的動作，等使用者處理
// - 畫面上的壘包/出局/比分 = 伺服器資料 + 佇列中尚未同步的動作（mergePending）

import { AtbatResultFields, parseAtbatInput } from '@/lib/atbat';
import { RunnerEvent, RunnerEventType, RunnerMove, RunnerPlayerRef } from '@/lib/baserunning';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

// 和比賽頁的 Atbat 同樣的欄位，未同步的打席用這個形狀先畫在畫面上
export interface PendingAtbat extends AtbatResultFields {
  id: string;
  game_id: string;
  player_id: string;
  inning: number | null;
  batting_order: number | null;
  rbi: number;
  quality: string | null;
  hit_x: number | null;
  hit_y: number | null;
  note: string | null;
  created_at: string;
  players: RunnerPlayerRef | null;
}

interface QueueItemBase {
  clientId: string;
  gameId: string;
  label: string; // 顯示用描述，例如「3 局 王小明 一壘安打」
  queuedAt: string;
  // 曾經送出但沒有收到回應：伺服器可能已經寫入（重送時靠 client_id 去重）
  attempted: boolean;
  serverErrors: number;
  // 伺服器拒絕的原因；第一筆有 error 時這場比賽暫停同步
  error: string | null;
}

export interface AtbatQueueItem extends QueueItemBase {
  kind: 'atbat';
  body: Record<string, unknown>;
  preview: { atbat: PendingAtbat; events: RunnerEvent[] };
}

export interface PlayQueueItem extends QueueItemBase {
  kind: 'play';
  body: Record<string, unknown>;
  preview: { events: RunnerEvent[] };
}

// 撤銷一筆「可能已經送到伺服器」的動作：連線後請伺服器刪掉這個 client_id 的紀錄（沒有就算了）
export interface CancelQueueItem extends QueueItemBase {
  kind: 'cancel';
}

export type QueueItem = AtbatQueueItem | PlayQueueItem | CancelQueueItem;

const KEY_PREFIX = 'bk:offline-queue:';

export function queueKey(gameId: string): string {
  return KEY_PREFIX + gameId;
}

export function readQueue(storage: KeyValueStorage, gameId: string): QueueItem[] {
  try {
    const raw = storage.getItem(queueKey(gameId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.clientId === 'string') : [];
  } catch {
    return [];
  }
}

export function writeQueue(storage: KeyValueStorage, gameId: string, items: QueueItem[]): void {
  if (items.length === 0) storage.removeItem(queueKey(gameId));
  else storage.setItem(queueKey(gameId), JSON.stringify(items));
}

export function pendingGameIds(storage: KeyValueStorage): string[] {
  const ids: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(KEY_PREFIX)) ids.push(key.slice(KEY_PREFIX.length));
  }
  return ids;
}

// 同一個 client_id 不會排兩次（例如重複點擊）
export function enqueue(storage: KeyValueStorage, item: QueueItem): QueueItem[] {
  const items = readQueue(storage, item.gameId);
  if (items.some((i) => i.clientId === item.clientId)) return items;
  const next = [...items, item];
  writeQueue(storage, item.gameId, next);
  return next;
}

// 每次都重新讀取再寫回，不會蓋掉同步途中新排進來的動作
export function updateItem(
  storage: KeyValueStorage,
  gameId: string,
  clientId: string,
  patch: Partial<Pick<QueueItemBase, 'attempted' | 'serverErrors' | 'error'>>
): void {
  writeQueue(
    storage,
    gameId,
    readQueue(storage, gameId).map((i) => (i.clientId === clientId ? { ...i, ...patch } : i))
  );
}

export function removeItem(storage: KeyValueStorage, gameId: string, clientId: string): void {
  writeQueue(
    storage,
    gameId,
    readQueue(storage, gameId).filter((i) => i.clientId !== clientId)
  );
}

// ============================================
// 撤銷尚未同步的動作
// ============================================

// 佇列裡最後一筆真正的動作（撤銷本身不算）
export function latestPending(items: QueueItem[]): AtbatQueueItem | PlayQueueItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== 'cancel') return item;
  }
  return null;
}

export type PendingUndo =
  | { kind: 'none' } // 佇列沒有動作，撤銷要改找伺服器上的最後一筆
  | { kind: 'cancelsOnly' } // 只剩待送出的撤銷，要先同步才能再撤銷伺服器上的紀錄
  | { kind: 'dropped'; item: AtbatQueueItem | PlayQueueItem }
  | { kind: 'cancelQueued'; item: AtbatQueueItem | PlayQueueItem };

// 從沒送出、或被伺服器拒絕（沒寫入）的動作直接移除；
// 送出過但沒收到回應的動作伺服器可能已經寫入，改成一筆「撤銷」等連線後請伺服器刪除
export function undoLatestPending(storage: KeyValueStorage, gameId: string): PendingUndo {
  const items = readQueue(storage, gameId);
  const target = latestPending(items);
  if (!target) return items.length > 0 ? { kind: 'cancelsOnly' } : { kind: 'none' };
  if (target.attempted && !target.error) {
    const cancel: CancelQueueItem = {
      kind: 'cancel',
      clientId: target.clientId,
      gameId,
      label: `撤銷：${target.label}`,
      queuedAt: new Date().toISOString(),
      attempted: false,
      serverErrors: 0,
      error: null,
    };
    writeQueue(storage, gameId, items.map((i) => (i.clientId === target.clientId ? cancel : i)));
    return { kind: 'cancelQueued', item: target };
  }
  writeQueue(storage, gameId, items.filter((i) => i.clientId !== target.clientId));
  return { kind: 'dropped', item: target };
}

// ============================================
// 畫面合併：伺服器資料 + 未同步的動作
// ============================================

export function isPendingId(id: string): boolean {
  return id.startsWith('pending:');
}

// 已經寫進伺服器（例如送出後沒收到回應，之後重新載入）但還留在佇列的動作不重複顯示；
// 待送出的撤銷則先把伺服器上對應的紀錄藏起來
export function mergePending<A extends { id: string }, E extends RunnerEvent>(
  atbats: A[],
  events: E[],
  queue: QueueItem[]
): { atbats: (A | PendingAtbat)[]; events: (E | RunnerEvent)[] } {
  const cancelled = new Set(queue.filter((i) => i.kind === 'cancel').map((i) => i.clientId));
  const cancelledAtbats = new Set(
    events.filter((e) => cancelled.has(e.play_id) && e.atbat_id).map((e) => e.atbat_id as string)
  );
  const serverPlays = new Set(events.map((e) => e.play_id));
  const outAtbats: (A | PendingAtbat)[] = atbats.filter((a) => !cancelledAtbats.has(a.id));
  const outEvents: (E | RunnerEvent)[] = events.filter((e) => !cancelled.has(e.play_id));
  for (const item of queue) {
    if (item.kind === 'cancel' || serverPlays.has(item.clientId)) continue;
    if (item.kind === 'atbat') outAtbats.push(item.preview.atbat);
    outEvents.push(...item.preview.events);
  }
  return { atbats: outAtbats, events: outEvents };
}

// ============================================
// 建立佇列項目
// ============================================

export function newClientId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // 非 https 環境沒有 randomUUID，用 getRandomValues 組 v4 UUID
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function base(gameId: string, clientId: string, label: string, now: string): QueueItemBase {
  return { clientId, gameId, label, queuedAt: now, attempted: false, serverErrors: 0, error: null };
}

function previewEvents(
  gameId: string,
  clientId: string,
  inning: number,
  atbatId: string | null,
  moves: RunnerMove[],
  batter: { playerId: string; player: RunnerPlayerRef | null } | null,
  standaloneType: RunnerEventType | null,
  now: string
): RunnerEvent[] {
  // 和 API 一樣只記有移動的跑者（停在原壘不用記）
  return moves
    .filter((m) => m.to !== m.from)
    .map((m) => ({
      id: `pending:${clientId}:${m.from}`,
      game_id: gameId,
      atbat_id: atbatId,
      play_id: clientId,
      inning,
      runner_player_id: m.from === 0 && batter ? batter.playerId : m.playerId,
      from_base: m.from,
      to_base: m.to,
      event_type: standaloneType ?? (m.from === 0 ? 'batter' : 'runner'),
      created_at: now,
      players: m.from === 0 && batter ? batter.player : m.player,
    }));
}

function runnersPayload(moves: RunnerMove[]) {
  return moves.map((m) => ({ player_id: m.playerId, from_base: m.from, to_base: m.to }));
}

export interface AtbatDraftInput {
  gameId: string;
  playerId: string;
  player: RunnerPlayerRef | null;
  battingOrder: number;
  inning: number;
  result: string;
  quality: string | null;
  rbi: number;
  hitX: number | null;
  hitY: number | null;
  note: string;
  moves: RunnerMove[];
  label: string;
}

export function buildAtbatItem(input: AtbatDraftInput, clientId = newClientId(), now = new Date().toISOString()): AtbatQueueItem {
  const body: Record<string, unknown> = {
    client_id: clientId,
    game_id: input.gameId,
    player_id: input.playerId,
    batting_order: input.battingOrder,
    inning: input.inning,
    result: input.result,
    quality: input.quality,
    rbi: input.rbi,
    hit_x: input.hitX,
    hit_y: input.hitY,
    note: input.note,
    runners: runnersPayload(input.moves),
  };
  // 預覽欄位和伺服器寫入時一樣經過 parseAtbatInput，畫面上的打數/打點才會一致
  const row = parseAtbatInput(body).row ?? {};
  const atbatId = `pending:${clientId}`;
  const atbat = {
    ...(row as unknown as Omit<PendingAtbat, 'id' | 'game_id' | 'player_id' | 'created_at' | 'players'>),
    id: atbatId,
    game_id: input.gameId,
    player_id: input.playerId,
    created_at: now,
    players: input.player,
  };
  return {
    ...base(input.gameId, clientId, input.label, now),
    kind: 'atbat',
    body,
    preview: {
      atbat,
      events: previewEvents(
        input.gameId, clientId, input.inning, atbatId, input.moves,
        { playerId: input.playerId, player: input.player }, null, now
      ),
    },
  };
}

export function buildPlayItem(
  input: { gameId: string; inning: number; type: RunnerEventType; moves: RunnerMove[]; label: string },
  clientId = newClientId(),
  now = new Date().toISOString()
): PlayQueueItem {
  return {
    ...base(input.gameId, clientId, input.label, now),
    kind: 'play',
    body: {
      client_id: clientId,
      game_id: input.gameId,
      inning: input.inning,
      event_type: input.type,
      runners: runnersPayload(input.moves),
    },
    preview: {
      events: previewEvents(input.gameId, clientId, input.inning, null, input.moves, null, input.type, now),
    },
  };
}

// ============================================
// 同步
// ============================================

export function requestFor(item: QueueItem): { url: string; body: Record<string, unknown> } {
  switch (item.kind) {
    case 'atbat':
      return { url: '/api/atbats/create', body: item.body };
    case 'play':
      return { url: '/api/runner-events/create', body: item.body };
    case 'cancel':
      return { url: '/api/games/undo', body: { game_id: item.gameId, client_id: item.clientId } };
  }
}

export type SendOutcome =
  | { kind: 'ok'; data: Record<string, unknown> }
  | { kind: 'network' } // 沒有回應（離線、逾時、閘道錯誤），稍後重送
  | { kind: 'auth'; error: string } // 登入過期，重新登入後再送
  | { kind: 'server'; error: string } // 伺服器內部錯誤，稍後重送幾次
  | { kind: 'rejected'; error: string }; // 伺服器拒絕這筆資料，要使用者處理

// status 為 null 表示 fetch 本身失敗（沒有連線）
export function classifyResponse(status: number | null, data: unknown): SendOutcome {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const message = typeof body?.error === 'string' ? body.error : null;
  if (status === null) return { kind: 'network' };
  // 2xx 但不是我們的 JSON（例如公共 Wi-Fi 的登入頁）也當作沒連上
  if (status >= 200 && status < 300) return body ? { kind: 'ok', data: body } : { kind: 'network' };
  if (status === 401) return { kind: 'auth', error: '登入已過期，請重新登入，登入後會自動繼續同步' };
  if (status === 408 || status === 429 || status === 502 || status === 504) return { kind: 'network' };
  if (status >= 500) {
    // 沒有我們 API 的錯誤訊息＝閘道/平台問題，當作網路問題；
    // 503 是 API 回報資料表尚未建立（migration），重送也不會好
    if (!message) return { kind: 'network' };
    if (status === 503) return { kind: 'rejected', error: message };
    return { kind: 'server', error: message };
  }
  return { kind: 'rejected', error: message ?? `伺服器拒絕這筆紀錄（${status}）` };
}

export type SyncResult =
  | { status: 'done'; synced: number } // 佇列已清空
  | { status: 'offline'; synced: number } // 沒有連線，稍後再試
  | { status: 'retry'; synced: number; error: string } // 暫時性錯誤，稍後再試
  | { status: 'blocked'; synced: number; error: string; item: QueueItem } // 等使用者處理
  | { status: 'busy'; synced: 0 }; // 這場比賽已經在同步中

export const MAX_SERVER_ERRORS = 3;

const running = new WeakMap<KeyValueStorage, Set<string>>();

export async function syncGame(
  storage: KeyValueStorage,
  gameId: string,
  send: (item: QueueItem) => Promise<SendOutcome>,
  onSynced?: (item: QueueItem, data: Record<string, unknown>) => void
): Promise<SyncResult> {
  const active = running.get(storage) ?? new Set<string>();
  running.set(storage, active);
  if (active.has(gameId)) return { status: 'busy', synced: 0 };
  active.add(gameId);
  let synced = 0;
  try {
    // 每輪重新讀取：同步途中新記錄的動作排在後面，會在同一輪接著送出
    for (;;) {
      const first = readQueue(storage, gameId)[0];
      if (!first) return { status: 'done', synced };
      if (first.error) return { status: 'blocked', synced, error: first.error, item: first };

      // 送出前先標記，送出途中 App 被關掉時也知道這筆可能已經寫入
      if (!first.attempted) updateItem(storage, gameId, first.clientId, { attempted: true });
      let outcome: SendOutcome;
      try {
        outcome = await send(first);
      } catch {
        outcome = { kind: 'network' };
      }

      // 送出途中使用者按了撤銷（這筆被換成「撤銷」）或移除：不要動到新的項目，下一輪照新的佇列處理
      const current = readQueue(storage, gameId).find((i) => i.clientId === first.clientId);
      const replaced = !current || current.kind !== first.kind;

      if (outcome.kind === 'network') return { status: 'offline', synced };
      if (outcome.kind === 'ok') {
        if (!replaced) removeItem(storage, gameId, first.clientId);
        synced += 1;
        onSynced?.(first, outcome.data);
        continue;
      }
      if (replaced) continue;

      switch (outcome.kind) {
        case 'auth':
          return { status: 'retry', synced, error: outcome.error };
        case 'server': {
          const serverErrors = first.serverErrors + 1;
          if (serverErrors >= MAX_SERVER_ERRORS) {
            updateItem(storage, gameId, first.clientId, { serverErrors, error: outcome.error });
            return { status: 'blocked', synced, error: outcome.error, item: { ...first, serverErrors, error: outcome.error } };
          }
          updateItem(storage, gameId, first.clientId, { serverErrors });
          return { status: 'retry', synced, error: outcome.error };
        }
        case 'rejected':
          updateItem(storage, gameId, first.clientId, { error: outcome.error });
          return { status: 'blocked', synced, error: outcome.error, item: { ...first, error: outcome.error } };
      }
    }
  } finally {
    active.delete(gameId);
  }
}

// 使用者按「重試」：清掉擋住同步的錯誤，下次同步重新送出
export function clearBlock(storage: KeyValueStorage, gameId: string): void {
  const first = readQueue(storage, gameId)[0];
  if (first?.error) updateItem(storage, gameId, first.clientId, { error: null, serverErrors: 0 });
}
