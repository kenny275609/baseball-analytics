// 壘包 / 跑壘推算（前後端共用）
//
// runner_events 每筆是一位跑者在一個 play 裡的移動：
//   from_base 0 = 打者，1-3 = 壘包；to_base 1-3 = 壘包，4 = 回本壘得分，null = 出局
// 同一個 play_id 的事件視為同時發生。壘包狀態只重播「該局」的事件，換局自然清空。

import { AtbatResultFields, ResultCode, countOuts } from '@/lib/atbat';

export type RunnerEventType =
  | 'batter'
  | 'runner'
  | 'steal'
  | 'caught_stealing'
  | 'wild_pitch'
  | 'passed_ball'
  | 'pickoff'
  | 'balk'
  | 'other';

// 兩個打席之間可單獨記錄的事件
export const STANDALONE_EVENTS: { type: RunnerEventType; label: string }[] = [
  { type: 'steal', label: '盜壘' },
  { type: 'caught_stealing', label: '盜壘失敗' },
  { type: 'wild_pitch', label: '暴投' },
  { type: 'passed_ball', label: '捕逸' },
  { type: 'pickoff', label: '牽制出局' },
  { type: 'balk', label: '投手犯規' },
  { type: 'other', label: '其他推進' },
];

const STANDALONE_TYPES = new Set(STANDALONE_EVENTS.map((e) => e.type));

export function standaloneLabel(type: string): string {
  return STANDALONE_EVENTS.find((e) => e.type === type)?.label ?? '跑壘';
}

export interface RunnerPlayerRef {
  name: string;
  number: string | null;
}

export interface RunnerEvent {
  id: string;
  game_id: string;
  atbat_id: string | null;
  play_id: string;
  inning: number;
  runner_player_id: string | null;
  from_base: number;
  to_base: number | null;
  event_type: RunnerEventType;
  created_at: string;
  players?: RunnerPlayerRef | null;
}

export interface Runner {
  playerId: string | null;
  player: RunnerPlayerRef | null;
}

// index 1-3 有意義；index 0 不用
export type Bases = [null, Runner | null, Runner | null, Runner | null];

export const EMPTY_BASES: Bases = [null, null, null, null];

// 依 play 分組，保持發生順序（API 回傳已依 created_at 排序）
function groupByPlay(events: RunnerEvent[]): RunnerEvent[][] {
  const groups = new Map<string, RunnerEvent[]>();
  for (const e of events) {
    const g = groups.get(e.play_id);
    if (g) g.push(e);
    else groups.set(e.play_id, [e]);
  }
  return [...groups.values()];
}

export function computeBases(events: RunnerEvent[], inning: number): Bases {
  const bases: Bases = [null, null, null, null];
  for (const play of groupByPlay(events.filter((e) => e.inning === inning))) {
    // 先把所有跑者從原壘拿起來再放下，前後順序才不會互相覆蓋（一壘→二壘、二壘→三壘）
    for (const e of play) {
      if (e.from_base >= 1 && e.from_base <= 3) bases[e.from_base] = null;
    }
    for (const e of play) {
      if (e.to_base !== null && e.to_base >= 1 && e.to_base <= 3) {
        bases[e.to_base] = { playerId: e.runner_player_id, player: e.players ?? null };
      }
    }
  }
  return bases;
}

// 本局出局數：有跑壘資料的打席看事件，舊打席（沒有事件）沿用結果的出局數
export function outsInInning(
  atbats: (AtbatResultFields & { id: string; inning: number | null })[],
  events: RunnerEvent[],
  inning: number
): number {
  const withEvents = new Set(events.map((e) => e.atbat_id).filter(Boolean));
  const legacy = atbats.filter((a) => a.inning === inning && !withEvents.has(a.id));
  const eventOuts = events.filter((e) => e.inning === inning && e.to_base === null).length;
  return countOuts(legacy) + eventOuts;
}

export function runsByInning(events: RunnerEvent[]): Map<number, number> {
  const runs = new Map<number, number>();
  for (const e of events) {
    if (e.to_base === 4) runs.set(e.inning, (runs.get(e.inning) ?? 0) + 1);
  }
  return runs;
}

// 每個打席都有跑壘事件（或還沒開打）的比賽，我方比分由跑壘事件推算；
// 只要混有沒有事件的舊打席（舊比賽重新開啟後繼續記錄也一樣），比分維持手動輸入，
// 避免既有的手動比分被「只算新事件」的分數覆蓋
export function isTracked(
  atbats: { id: string }[],
  events: { atbat_id: string | null }[]
): boolean {
  const withEvents = new Set(events.map((e) => e.atbat_id).filter(Boolean));
  return atbats.every((a) => withEvents.has(a.id));
}

// ============================================
// 打席後的跑者去向預設值
// ============================================

export interface RunnerMove {
  playerId: string | null;
  player: RunnerPlayerRef | null;
  from: number; // 0 = 打者
  to: number | null; // 停在原壘時 to === from
}

export const BATTER_DEFAULT: Partial<Record<ResultCode, number | null>> = {
  single: 1,
  double: 2,
  triple: 3,
  homerun: 4,
  walk: 1,
  hit_by_pitch: 1,
  error: 1,
  fielders_choice: 1,
  other: 1,
};

// 被迫進壘：從一壘開始連續有人的壘包都要往前推一個
function forcedAdvance(bases: Bases): Record<number, number> {
  const to: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
  if (bases[1]) {
    to[1] = 2;
    if (bases[2]) {
      to[2] = 3;
      if (bases[3]) to[3] = 4;
    }
  }
  return to;
}

export function defaultMoves(
  code: ResultCode,
  bases: Bases,
  batter: Runner,
  outsBefore = 0
): RunnerMove[] {
  const occupied = ([3, 2, 1] as const).filter((b) => bases[b]);
  const batterTo = BATTER_DEFAULT[code] ?? null;
  const forced = forcedAdvance(bases);

  const runnerTo = (b: number): number | null => {
    switch (code) {
      case 'walk':
      case 'hit_by_pitch':
      case 'other':
        return forced[b];
      case 'single':
      case 'error':
      case 'sacrifice':
        return Math.min(4, b + 1);
      case 'double':
        return Math.min(4, b + 2);
      case 'triple':
      case 'homerun':
        return 4;
      case 'fielders_choice': {
        // 最常見：一壘跑者在二壘被封殺；沒有一壘跑者就是最前面的跑者出局
        const victim = bases[1] ? 1 : occupied[0];
        return b === victim ? null : forced[b];
      }
      case 'double_play':
      case 'triple_play': {
        // 由後往前的跑者出局（雙殺 1 位、三殺 2 位，打者本身另算）
        const n = code === 'double_play' ? 1 : 2;
        const victims = [...occupied].reverse().slice(0, n);
        return victims.includes(b as 1 | 2 | 3) ? null : b;
      }
      default:
        return b;
    }
  };

  const moves: RunnerMove[] = [
    { playerId: batter.playerId, player: batter.player, from: 0, to: batterTo },
    ...occupied.map((b) => ({
      playerId: bases[b]!.playerId,
      player: bases[b]!.player,
      from: b,
      to: runnerTo(b),
    })),
  ];

  // 這個 play 造成第 3 出局（例如 2 出局野選封殺）：其他跑者不預填推進/得分，
  // 封殺或打者出局形成的第 3 出局，同一個 play 回本壘也不算分
  if (outsBefore + movesOuts(moves) >= 3) {
    return moves.map((m) => (m.from > 0 && m.to !== null ? { ...m, to: m.from } : m));
  }
  return moves;
}

// 失誤、雙殺、三殺、三振（得分來自暴投/捕逸）依規則不給打點，其他就是本次 play 回本壘的跑者數；
// 打者自己回本壘只有全壘打算打點（安打再趁失誤跑回來不算）
const NO_RBI_CODES: ResultCode[] = ['error', 'double_play', 'triple_play', 'strikeout'];

export function autoRbi(code: ResultCode, moves: RunnerMove[]): number {
  if (NO_RBI_CODES.includes(code)) return 0;
  return Math.min(4, moves.filter((m) => m.to === 4 && (m.from > 0 || code === 'homerun')).length);
}

// 回傳錯誤訊息；null 表示合法（前後端共用，moves 需包含停在原壘的跑者）
export function validateMoves(moves: Pick<RunnerMove, 'from' | 'to'>[]): string | null {
  const taken = new Set<number>();
  for (const m of moves) {
    if (m.to === null) continue;
    if (m.to < m.from || (m.from === 0 && m.to === 0)) return '跑者不能往回跑';
    if (m.to === 4) continue;
    if (taken.has(m.to)) return `${m.to} 壘不能同時有兩位跑者`;
    taken.add(m.to);
  }
  // 後位跑者不能超越前位跑者（出局的跑者不算；兩人都得分沒問題）
  const alive = moves.filter((m) => m.to !== null).sort((a, b) => a.from - b.from);
  for (let i = 0; i + 1 < alive.length; i++) {
    const back = alive[i].to!;
    const front = alive[i + 1].to!;
    if (back > front || (back === front && back !== 4)) return '後面的跑者不能超越前面的跑者';
  }
  return null;
}

export function movesOuts(moves: RunnerMove[]): number {
  return moves.filter((m) => m.to === null).length;
}

// 兩個打席之間的事件預設去向：暴投/捕逸/投手犯規所有跑者各推進一個壘，其他預設留在原壘
export function standaloneDefaults(type: RunnerEventType, bases: Bases): RunnerMove[] {
  const advanceAll = type === 'wild_pitch' || type === 'passed_ball' || type === 'balk';
  return ([3, 2, 1] as const)
    .filter((b) => bases[b])
    .map((b) => ({
      playerId: bases[b]!.playerId,
      player: bases[b]!.player,
      from: b,
      to: advanceAll ? b + 1 : b,
    }));
}

// 根據最後一個打席推算下一位打者，局數看最後一筆紀錄（打席或跑壘事件）：同局出局數滿 3 就換下一局
export function nextTurn(
  atbats: (AtbatResultFields & { id: string; inning: number | null; batting_order: number | null })[],
  events: RunnerEvent[],
  orders: number[]
): { slot: number; inning: number } {
  const last = atbats[atbats.length - 1];
  const lastEvent = events[events.length - 1];
  if (!last && !lastEvent) return { slot: orders[0] ?? 1, inning: 1 };

  const lastIndex = orders.indexOf(last?.batting_order ?? -1);
  const slot = last ? orders[(lastIndex + 1) % orders.length] ?? orders[0] ?? 1 : orders[0] ?? 1;
  const inning = Math.max(last?.inning ?? 1, lastEvent?.inning ?? 1);
  const outs = outsInInning(atbats, events, inning);
  return { slot, inning: outs >= 3 ? inning + 1 : inning };
}

// 修改打席結果時打者事件怎麼跟著改：
//   none = 不用動；update = 打者事件改成新結果的預設去向；warn = 有其他跑者移動或沒有打者事件，無法自動推算
export function batterEventPatch(
  oldCode: ResultCode | null,
  newCode: ResultCode | null,
  events: { id: string; from_base: number; to_base: number | null }[]
): { kind: 'none' } | { kind: 'warn' } | { kind: 'update'; id: string; to: number | null } {
  if (events.length === 0 || !newCode || newCode === oldCode) return { kind: 'none' };
  const batterEvent = events.find((e) => e.from_base === 0);
  if (!batterEvent || events.some((e) => e.from_base > 0)) return { kind: 'warn' };
  const to = BATTER_DEFAULT[newCode] ?? null;
  return to === batterEvent.to_base ? { kind: 'none' } : { kind: 'update', id: batterEvent.id, to };
}

// ============================================
// API 輸入驗證
// ============================================

export interface RunnerEventInput {
  runner_player_id: string | null;
  from_base: number;
  to_base: number | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// 先用完整輸入（含停在原壘的跑者）檢查壘包衝突與超越，
// 再只保留真正有移動的跑者（停在原壘不用記錄）；格式錯誤回傳 null。
// allowBatter（打席）時有送跑壘就必須包含打者，否則這個打席的打者出局/上壘會漏記
export function parseRunnerInputs(value: unknown, allowBatter: boolean): RunnerEventInput[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 4) return null;
  const all: RunnerEventInput[] = [];
  const fromSeen = new Set<number>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    // 不做型別轉換：null / '' / true 被 Number() 轉成 0、1 會變成打者或一壘
    const from = r.from_base;
    const to = r.to_base;
    if (typeof from !== 'number' || !Number.isInteger(from) || from < (allowBatter ? 0 : 1) || from > 3) return null;
    if (fromSeen.has(from)) return null;
    fromSeen.add(from);
    if (to !== null && (typeof to !== 'number' || !Number.isInteger(to) || to < from || to > 4)) return null;
    // 非 UUID 會讓 insert 失敗，在寫入打席之前就擋下
    if (r.player_id !== undefined && r.player_id !== null && r.player_id !== '' && !isUuid(r.player_id)) return null;
    const playerId = isUuid(r.player_id) ? r.player_id : null;
    all.push({ runner_player_id: playerId, from_base: from, to_base: to });
  }
  if (allowBatter && all.length > 0 && !fromSeen.has(0)) return null;
  if (validateMoves(all.map((r) => ({ from: r.from_base, to: r.to_base })))) return null;
  return all.filter((r) => r.to_base !== r.from_base);
}

export function isStandaloneType(value: unknown): value is RunnerEventType {
  return typeof value === 'string' && STANDALONE_TYPES.has(value as RunnerEventType);
}

export function baseLabel(to: number | null): string {
  if (to === null) return '出局';
  if (to === 4) return '得分';
  return `${to} 壘`;
}
