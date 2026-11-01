import { describe, expect, it } from 'vitest';
import { resultToFields, ResultCode } from '@/lib/atbat';
import { batterLines, buildShareCard, pickMvp, ShareAtbat } from '@/lib/shareCard';

let t = 0;
const ab = (player_id: string, code: ResultCode, inning: number, rbi = 0): ShareAtbat => ({
  ...resultToFields(code), player_id, inning, rbi, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString(),
});
const rows = [
  { playerId: 'a', name: '王小明', slot: 1, current: true },
  { playerId: 'b', name: '李四', slot: 2, current: true },
  { playerId: 'c', name: '張三', slot: 3, current: true },
];
const atbats = [
  ab('a', 'single', 1), ab('b', 'strikeout', 1), ab('c', 'homerun', 1, 2),
  ab('a', 'walk', 3), ab('b', 'double', 3, 1), ab('c', 'groundout', 3),
];
const events = [
  { inning: 1, runner_player_id: 'a', to_base: 4 }, { inning: 1, runner_player_id: 'c', to_base: 4 },
  { inning: 3, runner_player_id: 'a', to_base: 4 }, { inning: 3, runner_player_id: 'b', to_base: 2 },
];

describe('batterLines', () => {
  it('依時間列出打席結果、計算得分', () => {
    const [a, b, c] = batterLines(rows, atbats, events);
    expect(a).toMatchObject({ ab: 1, h: 1, bb: 1, r: 2, results: ['1B', 'BB'] });
    expect(b).toMatchObject({ ab: 2, h: 1, rbi: 1, so: 1, results: ['K', '2B'] });
    expect(c).toMatchObject({ ab: 2, h: 1, rbi: 2, hr: 1, r: 1, results: ['HR', 'GO'] });
    expect(c.summary).toBe('2 打數 1 安打 1 全壘打 2 打點 1 得分');
  });
});

describe('pickMvp', () => {
  it('打點最多者優先', () => {
    expect(pickMvp(batterLines(rows, atbats, events))?.name).toBe('張三');
  });
  it('打點相同比安打', () => {
    const lines = batterLines(rows, [ab('a', 'single', 1), ab('a', 'single', 2), ab('b', 'single', 1)], []);
    expect(pickMvp(lines)?.name).toBe('王小明');
  });
  it('全隊沒有安打也沒有打點時不選', () => {
    expect(pickMvp(batterLines(rows, [ab('a', 'strikeout', 1)], []))).toBeNull();
  });
});

describe('buildShareCard', () => {
  const base = {
    opponent: '火鳥隊', gameDate: '2026-10-31', innings: 7,
    ourRuns: new Map([[1, 2], [3, 1]]), ourTotal: 3, oppRuns: new Map([[1, 0], [2, 1]]), oppTotal: 1,
    rows, atbats, events,
  };
  it('客場：我方先攻在上', () => {
    const d = buildShareCard({ ...base, homeAway: 'away' });
    expect(d.outcome).toBe('W');
    expect(d.topLabel).toBe('我方');
    expect(d.topRuns.slice(0, 4)).toEqual([2, 0, 1, null]);
    expect(d.bottomRuns.slice(0, 3)).toEqual([0, 1, null]);
    expect(d.innings).toHaveLength(7);
    expect(d.mvp?.name).toBe('張三');
  });
  it('主場：對手在上；舊比賽沒有逐局得分顯示 null', () => {
    const d = buildShareCard({ ...base, homeAway: 'home', ourRuns: null, ourTotal: 1, oppTotal: 1 });
    expect(d.topLabel).toBe('火鳥隊');
    expect(d.bottomRuns.every((x) => x === null)).toBe(true);
    expect(d.outcome).toBe('T');
  });
});
