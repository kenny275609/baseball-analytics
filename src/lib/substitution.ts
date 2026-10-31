// 比賽中換人（前後端共用）
//
// game_lineups 保存每個棒次「目前」的球員（打序輪轉、記錄打席都看它）；
// game_substitutions 保存每一次換人：誰換下誰、第幾局上/下、哪一種換人、哪個棒次。
// 已記錄的打席 atbats.player_id 是當時的打者，換人不會改動，原球員的成績維持不變。
//
//   pinch_hitter 代打：換掉目前打者的棒次，之後這一棒都是代打者
//   pinch_runner 代跑：換掉壘上的跑者（壘包與之後的跑壘都是代跑者），並接手他的棒次
//   replace      守備/一般替換：直接換掉某一棒
//   add_slot     加棒次：比賽中多一位打者（例如第 10、11 棒），排在最後一棒之後輪轉

import { Bases, RunnerPlayerRef, isUuid } from '@/lib/baserunning';
import { timeKey } from '@/lib/undo';

export type SubType = 'pinch_hitter' | 'pinch_runner' | 'replace' | 'add_slot';
export type Half = 'top' | 'bottom';

export const SUB_TYPES: { type: SubType; label: string }[] = [
  { type: 'pinch_hitter', label: '代打' },
  { type: 'pinch_runner', label: '代跑' },
  { type: 'replace', label: '一般替換' },
  { type: 'add_slot', label: '加棒次' },
];

export const MAX_BATTING_ORDER = 20;

export interface Substitution {
  id: string;
  game_id: string;
  client_id: string | null;
  sub_type: SubType;
  batting_order: number;
  out_player_id: string | null;
  in_player_id: string | null;
  inning: number | null;
  half: Half | null;
  base: number | null;
  created_at: string;
  out_player?: RunnerPlayerRef | null;
  in_player?: RunnerPlayerRef | null;
}

export interface LineupEntry {
  batting_order: number;
  player_id: string;
  players: RunnerPlayerRef | null;
}

export function subTypeLabel(type: string): string {
  return SUB_TYPES.find((t) => t.type === type)?.label ?? '換人';
}

// 我方進攻的半局：客隊打上半、主隊打下半
export function offenseHalf(homeAway: 'home' | 'away'): Half {
  return homeAway === 'away' ? 'top' : 'bottom';
}

export function defenseHalf(homeAway: 'home' | 'away'): Half {
  return homeAway === 'away' ? 'bottom' : 'top';
}

export function inningLabel(inning: number | null, half: Half | null): string {
  if (!inning) return '';
  return `${inning} 局${half === 'top' ? '上' : half === 'bottom' ? '下' : ''}`;
}

// 打序依棒次排序；加棒次後新的一棒自然排在最後，nextTurn 依這個順序輪轉
export function battingOrders(lineup: { batting_order: number }[]): number[] {
  return [...new Set(lineup.map((l) => l.batting_order))].sort((a, b) => a - b);
}

// 下一個可以加的棒次（最後一棒 + 1）；已到上限回傳 null
export function nextSlotNumber(lineup: { batting_order: number }[]): number | null {
  const max = Math.max(0, ...lineup.map((l) => l.batting_order));
  return max + 1 <= MAX_BATTING_ORDER ? max + 1 : null;
}

// 壘上跑者目前在哪一棒（代跑接手這一棒）；不在打序裡回傳 null
export function slotOfPlayer(lineup: LineupEntry[], playerId: string | null): number | null {
  if (!playerId) return null;
  return lineup.find((l) => l.player_id === playerId)?.batting_order ?? null;
}

// 可以換上場的球員：目前不在打序上的人（換下場的人可以再上場，聯盟規則由使用者自行判斷）
export function benchPlayers<P extends { id: string }>(players: P[], lineup: { player_id: string }[]): P[] {
  const playing = new Set(lineup.map((l) => l.player_id));
  return players.filter((p) => !playing.has(p.id));
}

export interface FormerPlayer {
  playerId: string | null;
  player: RunnerPlayerRef | null;
  sub: Substitution; // 把他換下場的那次換人
}

// 每個棒次曾經上場、已被換下的球員（依換人時間，最早的在前）
export function formerBySlot(subs: Substitution[]): Map<number, FormerPlayer[]> {
  const map = new Map<number, FormerPlayer[]>();
  const sorted = [...subs].sort((a, b) => timeKey(a.created_at) - timeKey(b.created_at));
  for (const s of sorted) {
    if (s.sub_type === 'add_slot') continue;
    const list = map.get(s.batting_order) ?? [];
    list.push({ playerId: s.out_player_id, player: s.out_player ?? null, sub: s });
    map.set(s.batting_order, list);
  }
  return map;
}

// 打序列上這一棒已換下的球員（刪除線）：不含目前在這一棒的人（再上場），同一人只列一次
export function formerNamesForSlot(former: FormerPlayer[], currentId: string | null): FormerPlayer[] {
  const seen = new Set<string>();
  return former.filter((f) => {
    if (f.playerId && (f.playerId === currentId || seen.has(f.playerId))) return false;
    if (f.playerId) seen.add(f.playerId);
    return true;
  });
}

// 本場成績的球員順序：依棒次，每一棒先列先發（最早上場的），再依序列出替補，最後是目前的球員；
// 打過但不在任何棒次紀錄裡的人（例如舊版直接覆寫打序）排在最後。成績本身一律依 atbats.player_id 計算
export function boxScoreRows(
  lineup: LineupEntry[],
  subs: Substitution[],
  atbats: { player_id: string; players?: RunnerPlayerRef | null }[]
): { playerId: string; player: RunnerPlayerRef | null; slot: number | null; current: boolean }[] {
  const rows: { playerId: string; player: RunnerPlayerRef | null; slot: number | null; current: boolean }[] = [];
  const seen = new Set<string>();
  const add = (playerId: string | null, player: RunnerPlayerRef | null, slot: number | null, current: boolean) => {
    if (!playerId || seen.has(playerId)) return;
    seen.add(playerId);
    rows.push({ playerId, player, slot, current });
  };
  const former = formerBySlot(subs);
  // 換下後又再上場的人以目前的棒次為準，不列成退場
  const currentIds = new Set(lineup.map((l) => l.player_id));
  for (const order of battingOrders(lineup)) {
    for (const f of former.get(order) ?? []) {
      if (!f.playerId || !currentIds.has(f.playerId)) add(f.playerId, f.player, order, false);
    }
    const cur = lineup.find((l) => l.batting_order === order);
    if (cur) add(cur.player_id, cur.players, order, true);
  }
  for (const a of atbats) add(a.player_id, a.players ?? null, null, false);
  return rows;
}

// ============================================
// API 輸入驗證
// ============================================

export interface SubstitutionInput {
  client_id: string | null;
  game_id: string;
  sub_type: SubType;
  batting_order: number;
  out_player_id: string | null; // 換下的人（畫面上這一棒目前的球員）；加棒次為 null
  in_player_id: string;
  inning: number | null;
  half: Half | null;
  base: number | null; // 代跑：跑者所在的壘包
}

const TYPES = new Set<string>(SUB_TYPES.map((t) => t.type));

export function parseSubstitutionInput(body: unknown): { value: SubstitutionInput } | { error: string } {
  if (!body || typeof body !== 'object') return { error: '換人資料錯誤' };
  const b = body as Record<string, unknown>;
  if (!isUuid(b.game_id)) return { error: '缺少比賽' };
  if (b.client_id !== undefined && b.client_id !== null && !isUuid(b.client_id)) return { error: 'client_id 格式錯誤' };
  if (typeof b.sub_type !== 'string' || !TYPES.has(b.sub_type)) return { error: '請選擇換人方式' };
  const type = b.sub_type as SubType;
  const order = b.batting_order;
  if (typeof order !== 'number' || !Number.isInteger(order) || order < 1 || order > MAX_BATTING_ORDER) {
    return { error: '棒次錯誤' };
  }
  if (!isUuid(b.in_player_id)) return { error: '請選擇上場的球員' };
  let out: string | null = null;
  if (type === 'add_slot') {
    if (b.out_player_id !== undefined && b.out_player_id !== null) return { error: '加棒次沒有換下的球員' };
  } else {
    if (!isUuid(b.out_player_id)) return { error: '缺少換下的球員' };
    out = b.out_player_id;
    if (out === b.in_player_id) return { error: '換上和換下的是同一位球員' };
  }
  let inning: number | null = null;
  if (b.inning !== undefined && b.inning !== null) {
    if (typeof b.inning !== 'number' || !Number.isInteger(b.inning) || b.inning < 1 || b.inning > 30) {
      return { error: '局數錯誤' };
    }
    inning = b.inning;
  }
  let half: Half | null = null;
  if (b.half !== undefined && b.half !== null) {
    if (b.half !== 'top' && b.half !== 'bottom') return { error: '半局錯誤' };
    half = b.half;
  }
  let base: number | null = null;
  if (type === 'pinch_runner') {
    if (typeof b.base !== 'number' || !Number.isInteger(b.base) || b.base < 1 || b.base > 3) {
      return { error: '請選擇要代跑的壘包' };
    }
    // 壘包跟著局數重播，代跑一定要有局數
    if (!inning) return { error: '代跑需要局數' };
    base = b.base;
  } else if (b.base !== undefined && b.base !== null) {
    return { error: '只有代跑需要壘包' };
  }
  return {
    value: {
      client_id: isUuid(b.client_id) ? b.client_id : null,
      game_id: b.game_id,
      sub_type: type,
      batting_order: order,
      out_player_id: out,
      in_player_id: b.in_player_id,
      inning,
      half,
      base,
    },
  };
}

// 伺服器端：以資料庫目前的打序（與壘包）檢查這次換人。回傳錯誤與狀態碼；null 表示可以寫入
export function checkSubstitution(
  input: SubstitutionInput,
  lineup: { batting_order: number; player_id: string }[],
  bases: Bases | null
): { status: 400 | 409; error: string } | null {
  if (lineup.some((l) => l.player_id === input.in_player_id)) {
    return { status: 400, error: '這位球員已經在打序上' };
  }
  const slot = lineup.find((l) => l.batting_order === input.batting_order);
  if (input.sub_type === 'add_slot') {
    if (slot) return { status: 409, error: `第 ${input.batting_order} 棒已經有人（可能是其他裝置剛加過），請重新整理` };
    if (input.batting_order !== nextSlotNumber(lineup)) {
      return { status: 409, error: '新的棒次要接在最後一棒之後，請重新整理後再試' };
    }
    return null;
  }
  if (!slot) return { status: 409, error: `第 ${input.batting_order} 棒不在打序中，請重新整理` };
  if (slot.player_id !== input.out_player_id) {
    return { status: 409, error: `第 ${input.batting_order} 棒的球員已經換過（可能是其他裝置剛換人），請重新整理後再確認` };
  }
  if (input.sub_type === 'pinch_runner') {
    const runner = bases?.[input.base as 1 | 2 | 3];
    if (!runner) return { status: 409, error: `${input.base} 壘目前沒有跑者，請重新整理` };
    if (runner.playerId !== input.out_player_id) {
      return { status: 409, error: `${input.base} 壘跑者與畫面不符（可能是其他裝置剛記錄），請重新整理` };
    }
  }
  // 一般替換不會換壘上的跑者：換掉壘上的人會讓打序和壘包對不上，之後也無法再代跑
  if (input.sub_type === 'replace' && playerOnBase(bases, input.out_player_id)) {
    return { status: 409, error: ON_BASE_REPLACE_ERROR };
  }
  return null;
}

export const ON_BASE_REPLACE_ERROR = '這位球員目前在壘上，請改用「代跑」換人';

export function playerOnBase(bases: Bases | null, playerId: string | null): boolean {
  if (!bases || !playerId) return false;
  return ([1, 2, 3] as const).some((b) => bases[b]?.playerId === playerId);
}
