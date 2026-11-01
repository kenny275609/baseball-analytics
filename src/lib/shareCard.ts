// 賽後戰報分享卡：把一場比賽整理成卡片要顯示的資料（純函式，前後端都可測）
// 只讀現有資料：打席、跑壘事件、對手逐局得分、先發/換人；不改資料庫。
// 壘球規則：沒有盜壘，得分只看跑壘事件的 to_base === 4。
import { AtbatResultFields, computeStats, fieldsToResult, getResultOption } from '@/lib/atbat';

export interface ShareAtbat extends AtbatResultFields {
  player_id: string;
  inning: number | null;
  rbi: number | null;
  created_at: string;
}

export interface ShareRunnerEvent {
  inning: number;
  runner_player_id: string | null;
  to_base: number | null;
}

export interface ShareRow {
  playerId: string;
  name: string;
  slot: number | null;
  current: boolean;
}

export interface ShareCardInput {
  teamName?: string;
  opponent: string;
  gameDate: string;
  homeAway: 'home' | 'away';
  innings: number;
  ourRuns: Map<number, number> | null; // null：舊比賽沒有逐局資料
  ourTotal: number | null;
  oppRuns: Map<number, number>;
  oppTotal: number | null;
  rows: ShareRow[];
  atbats: ShareAtbat[];
  events: ShareRunnerEvent[];
}

export interface BatterLine {
  playerId: string;
  name: string;
  slot: number | null;
  current: boolean;
  ab: number;
  h: number;
  rbi: number;
  r: number;
  bb: number;
  so: number;
  hr: number;
  tb: number;
  results: string[]; // 依時間順序的打席結果縮寫，例如 ['1B', 'K', 'HR']
  summary: string; // 「3 打數 2 安打 1 打點」
}

export interface ShareCardData {
  title: string;
  subtitle: string;
  outcome: 'W' | 'L' | 'T' | null;
  innings: number[];
  topLabel: string;
  bottomLabel: string;
  topRuns: (number | null)[];
  bottomRuns: (number | null)[];
  topTotal: number | null;
  bottomTotal: number | null;
  mvp: (BatterLine & { reason: string }) | null;
  batters: BatterLine[];
  teamLine: string;
}

export function batterSummary(l: Pick<BatterLine, 'ab' | 'h' | 'rbi' | 'r' | 'bb' | 'hr'>): string {
  const parts = [`${l.ab} 打數 ${l.h} 安打`];
  if (l.hr) parts.push(`${l.hr} 全壘打`);
  if (l.rbi) parts.push(`${l.rbi} 打點`);
  if (l.r) parts.push(`${l.r} 得分`);
  if (l.bb) parts.push(`${l.bb} 四死球`);
  return parts.join(' ');
}

export function batterLines(rows: ShareRow[], atbats: ShareAtbat[], events: ShareRunnerEvent[]): BatterLine[] {
  const runs = new Map<string, number>();
  for (const e of events) {
    if (e.to_base === 4 && e.runner_player_id) runs.set(e.runner_player_id, (runs.get(e.runner_player_id) ?? 0) + 1);
  }
  const sorted = [...atbats].sort((a, b) => (a.inning ?? 0) - (b.inning ?? 0) || Date.parse(a.created_at) - Date.parse(b.created_at));
  return rows.map((row) => {
    const mine = sorted.filter((a) => a.player_id === row.playerId);
    const s = computeStats(mine);
    const results = mine
      .map((a) => getResultOption(fieldsToResult(a))?.short)
      .filter((x): x is string => !!x && x !== '—');
    const base = { ab: s.ab, h: s.h, rbi: s.rbi, r: runs.get(row.playerId) ?? 0, bb: s.bb + s.hbp, so: s.so, hr: s.hr, tb: s.tb };
    return { playerId: row.playerId, name: row.name, slot: row.slot, current: row.current, ...base, results, summary: batterSummary(base) };
  });
}

// MVP：打點 → 安打 → 壘打數 → 得分 → 三振少；至少要有 1 安打或 1 打點才選
export function pickMvp(lines: BatterLine[]): (BatterLine & { reason: string }) | null {
  const cand = lines.filter((l) => l.h > 0 || l.rbi > 0);
  if (!cand.length) return null;
  const best = [...cand].sort(
    (a, b) => b.rbi - a.rbi || b.h - a.h || b.tb - a.tb || b.r - a.r || a.so - b.so || (a.slot ?? 99) - (b.slot ?? 99)
  )[0];
  return { ...best, reason: best.summary };
}

export function buildShareCard(input: ShareCardInput): ShareCardData {
  const team = input.teamName || '我方';
  const cols = Array.from({ length: Math.max(1, input.innings) }, (_, i) => i + 1);
  // 有打席或有得分紀錄的最後一局；之後的局數顯示「—」
  const ourRuns = input.ourRuns;
  const lastOur = Math.max(0, ...input.atbats.map((a) => a.inning ?? 0), ...(ourRuns ? ourRuns.keys() : []));
  const lastOpp = Math.max(0, ...input.oppRuns.keys());
  const our = cols.map((i) => (ourRuns ? ourRuns.get(i) ?? (i <= lastOur ? 0 : null) : null));
  const opp = cols.map((i) => input.oppRuns.get(i) ?? (i <= lastOpp ? 0 : null));
  // 先攻在上：主場時對手先攻
  const home = input.homeAway === 'home';
  const outcome =
    input.ourTotal === null || input.oppTotal === null
      ? null
      : input.ourTotal > input.oppTotal ? 'W' : input.ourTotal < input.oppTotal ? 'L' : 'T';
  const batters = batterLines(input.rows, input.atbats, input.events);
  const t = computeStats(input.atbats);
  return {
    title: `${team} vs ${input.opponent}`,
    subtitle: `${input.gameDate} · ${home ? '主場' : '客場'}`,
    outcome,
    innings: cols,
    topLabel: home ? input.opponent : team,
    bottomLabel: home ? team : input.opponent,
    topRuns: home ? opp : our,
    bottomRuns: home ? our : opp,
    topTotal: home ? input.oppTotal : input.ourTotal,
    bottomTotal: home ? input.ourTotal : input.oppTotal,
    mvp: pickMvp(batters),
    batters: batters.filter((b) => b.ab > 0 || b.bb > 0 || b.results.length > 0 || b.current),
    teamLine: `全隊 ${t.h} 安打 / ${t.ab} 打數 · ${t.rbi} 打點`,
  };
}

export const OUTCOME_LABEL: Record<'W' | 'L' | 'T', string> = { W: '勝', L: '敗', T: '和' };
