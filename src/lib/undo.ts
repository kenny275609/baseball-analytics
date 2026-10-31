// 撤銷上一步（前後端共用）：找出一場比賽最後一筆動作——打席或兩個打席之間的跑壘 play
//
// 打席造成的跑壘事件和打席算同一筆（刪打席時 ON DELETE CASCADE 一起刪），
// 所以只比較「打席」和「atbat_id 為 null 的跑壘 play」誰比較晚建立。

export type UndoRequest = { kind: 'atbat'; id: string } | { kind: 'play'; play_id: string };
export type UndoTarget = UndoRequest & { created_at: string };

interface AtbatRef {
  id: string;
  created_at: string;
}

interface EventRef {
  id: string;
  atbat_id: string | null;
  play_id: string;
  created_at: string;
}

// timestamptz 轉成微秒比較（Date.parse 只到毫秒，Postgres 有到微秒），
// 不依賴字串格式或時區寫法一致
export function timeKey(at: string): number {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return 0;
  const frac = /\.(\d+)/.exec(at)?.[1] ?? '';
  return ms * 1000 + Number(frac.slice(3, 6).padEnd(3, '0'));
}

// 先比建立時間，相同時用 id，和 API 的 order('created_at').order('id') 一致
function isLater(a: { created_at: string; id: string }, b: { created_at: string; id: string }): boolean {
  const ka = timeKey(a.created_at);
  const kb = timeKey(b.created_at);
  return ka !== kb ? ka > kb : a.id > b.id;
}

export function latestAction(atbats: AtbatRef[], events: EventRef[]): UndoTarget | null {
  let atbat: AtbatRef | null = null;
  for (const a of atbats) if (!atbat || isLater(a, atbat)) atbat = a;
  let play: EventRef | null = null;
  for (const e of events) if (!e.atbat_id && (!play || isLater(e, play))) play = e;

  // 打席的跑壘事件在打席之後才寫入，所以 play 晚於打席本身就代表 play 是後來記的
  if (atbat && (!play || timeKey(atbat.created_at) >= timeKey(play.created_at))) {
    return { kind: 'atbat', id: atbat.id, created_at: atbat.created_at };
  }
  if (play) return { kind: 'play', play_id: play.play_id, created_at: play.created_at };
  return null;
}

export function sameTarget(a: UndoRequest | null, b: UndoRequest | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'atbat' && b.kind === 'atbat') return a.id === b.id;
  if (a.kind === 'play' && b.kind === 'play') return a.play_id === b.play_id;
  return false;
}

// 撤銷後剩下的打席與跑壘事件
export function withoutTarget<A extends AtbatRef, E extends EventRef>(
  atbats: A[],
  events: E[],
  target: UndoRequest
): { atbats: A[]; events: E[] } {
  if (target.kind === 'atbat') {
    return {
      atbats: atbats.filter((a) => a.id !== target.id),
      events: events.filter((e) => e.atbat_id !== target.id),
    };
  }
  return { atbats, events: events.filter((e) => e.play_id !== target.play_id) };
}

// API 輸入：{ kind: 'atbat', id } 或 { kind: 'play', play_id }
export function parseUndoRequest(value: unknown, isId: (v: unknown) => v is string): UndoRequest | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.kind === 'atbat' && isId(v.id)) return { kind: 'atbat', id: v.id };
  if (v.kind === 'play' && isId(v.play_id)) return { kind: 'play', play_id: v.play_id };
  return null;
}
