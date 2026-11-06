import { describe, expect, it } from 'vitest';
import {
  DefensePlay,
  applyPositionChanges,
  currentDefenseInning,
  defenseNotation,
  fieldingCredits,
  fieldingStats,
  formatFieldingPct,
  parseDefenseInput,
  pathError,
  playsByInning,
} from './defense';

const GAME = '11111111-1111-4111-8111-111111111111';
let seq = 0;
const play = (inning: number, result: DefensePlay['result'], path: number[], players?: (string | null)[]): DefensePlay => ({
  id: `p${++seq}`,
  inning,
  result,
  path,
  path_players: players ?? path.map((p) => `player${p}`),
  created_at: `2026-11-07T00:00:${String(seq).padStart(2, '0')}Z`,
});

describe('defenseNotation', () => {
  it('formats common plays', () => {
    expect(defenseNotation('strikeout', [2])).toBe('K');
    expect(defenseNotation('strikeout', [2, 3])).toBe('K 2-3');
    expect(defenseNotation('flyout', [8])).toBe('F8');
    expect(defenseNotation('groundout', [6, 3])).toBe('6-3');
    expect(defenseNotation('groundout', [3])).toBe('3U');
    expect(defenseNotation('double_play', [6, 4, 3])).toBe('6-4-3 DP');
    expect(defenseNotation('error', [6])).toBe('E6');
    expect(defenseNotation('single', [7])).toBe('1B(7)');
    expect(defenseNotation('walk', [])).toBe('BB');
    expect(defenseNotation('sacrifice_fly', [9])).toBe('SF9');
  });
});

describe('pathError', () => {
  it('requires a path for outs in play', () => {
    expect(pathError('groundout', [])).toMatch('守備路徑');
    expect(pathError('groundout', [6, 3])).toBeNull();
    expect(pathError('error', [])).toMatch('失誤');
  });
  it('limits single-position results', () => {
    expect(pathError('flyout', [8, 6])).toMatch('接球');
    expect(pathError('single', [7, 6])).toMatch('一個位置');
    expect(pathError('single', [])).toBeNull();
    expect(pathError('walk', [1])).toMatch('不用');
    expect(pathError('strikeout', [2, 3])).toBeNull();
    expect(pathError('strikeout', [2, 3, 4])).toMatch('三振');
  });
  it('rejects bad positions', () => {
    expect(pathError('groundout', [11])).toMatch('位置錯誤');
    expect(pathError('groundout', [0])).toMatch('位置錯誤');
  });
});

describe('parseDefenseInput', () => {
  it('stores catcher for a strikeout without path', () => {
    const r = parseDefenseInput({ game_id: GAME, inning: 1, result: 'strikeout', path: [] });
    expect('value' in r && r.value.path).toEqual([2]);
  });
  it('rejects bad input', () => {
    expect(parseDefenseInput({ game_id: 'x', inning: 1, result: 'strikeout', path: [] })).toHaveProperty('error');
    expect(parseDefenseInput({ game_id: GAME, inning: 0, result: 'strikeout', path: [] })).toHaveProperty('error');
    expect(parseDefenseInput({ game_id: GAME, inning: 1, result: 'bunt', path: [] })).toHaveProperty('error');
    expect(parseDefenseInput({ game_id: GAME, inning: 1, result: 'groundout', path: 'x' })).toHaveProperty('error');
  });
});

describe('fieldingCredits', () => {
  it('credits putouts and assists along the path', () => {
    expect(fieldingCredits('groundout', [6, 3])).toEqual({ putouts: [1], assists: [0], error: null });
    expect(fieldingCredits('double_play', [6, 4, 3])).toEqual({ putouts: [1, 2], assists: [0, 1], error: null });
    expect(fieldingCredits('flyout', [8])).toEqual({ putouts: [0], assists: [], error: null });
    expect(fieldingCredits('strikeout', [2])).toEqual({ putouts: [0], assists: [], error: null });
    expect(fieldingCredits('strikeout', [2, 3])).toEqual({ putouts: [1], assists: [0], error: null });
    expect(fieldingCredits('double_play', [3])).toEqual({ putouts: [0, 0], assists: [], error: null });
    expect(fieldingCredits('error', [6])).toEqual({ putouts: [], assists: [], error: 0 });
    expect(fieldingCredits('single', [7])).toEqual({ putouts: [], assists: [], error: null });
  });

  it('credits each fielder at most one assist per play', () => {
    // 夾殺 6-5-6-5：游擊、三壘各一次助殺，三壘刺殺
    expect(fieldingCredits('other_out', [6, 5, 6, 5])).toEqual({ putouts: [3], assists: [0, 1], error: null });
    // 折返雙殺 3-6-3：一壘助殺 + 刺殺，游擊助殺 + 刺殺
    expect(fieldingCredits('double_play', [3, 6, 3])).toEqual({ putouts: [1, 2], assists: [0, 1], error: null });
    expect(fieldingCredits('double_play', [6, 4, 6, 3])).toEqual({ putouts: [2, 3], assists: [0, 1], error: null });
  });

  it('handles triple plays', () => {
    expect(defenseNotation('triple_play', [5, 4, 3])).toBe('5-4-3 TP');
    expect(defenseNotation('triple_play', [6])).toBe('6U TP');
    expect(fieldingCredits('triple_play', [5, 4, 3])).toEqual({ putouts: [0, 1, 2], assists: [0, 1], error: null });
    expect(fieldingCredits('triple_play', [6])).toEqual({ putouts: [0, 0, 0], assists: [], error: null });
  });
});

describe('fieldingStats', () => {
  it('sums by the player recorded at the time of the play', () => {
    const stats = fieldingStats([
      play(1, 'groundout', [6, 3]),
      play(1, 'double_play', [6, 4, 3]),
      play(2, 'error', [6], ['sub6']),
      play(2, 'flyout', [8], [null]),
    ]);
    const get = (k: string) => stats.find((s) => s.key === k);
    expect(get('player6')).toMatchObject({ po: 0, a: 2, e: 0 });
    expect(get('player3')).toMatchObject({ po: 2, a: 0 });
    expect(get('player4')).toMatchObject({ po: 1, a: 1 });
    expect(get('sub6')).toMatchObject({ e: 1 });
    expect(get('pos:8')).toMatchObject({ playerId: null, po: 1 });
  });
  it('merges one player across positions and counts a rundown assist once', () => {
    const stats = fieldingStats([
      play(1, 'groundout', [6, 3], ['amy', 'bob']),
      play(2, 'groundout', [4, 3], ['amy', 'bob']),
      play(3, 'other_out', [6, 5, 6, 5], ['amy', 'cat', 'amy', 'cat']),
    ]);
    expect(stats.find((s) => s.key === 'amy')).toMatchObject({ positions: [6, 4], po: 0, a: 3 });
    expect(stats.find((s) => s.key === 'cat')).toMatchObject({ positions: [5], po: 1, a: 1 });
  });

  it('splits each player by position with fielding percentage', () => {
    const stats = fieldingStats([
      play(1, 'groundout', [6, 3], ['amy', 'bob']),
      play(1, 'error', [6], ['amy']),
      play(2, 'flyout', [4], ['amy']),
    ]);
    const amy = stats.find((s) => s.key === 'amy')!;
    expect(amy).toMatchObject({ po: 1, a: 1, e: 1 });
    expect(amy.byPosition).toEqual([
      { pos: 6, po: 0, a: 1, e: 1 },
      { pos: 4, po: 1, a: 0, e: 0 },
    ]);
    expect(formatFieldingPct(amy)).toBe('.667');
    expect(formatFieldingPct(amy.byPosition[1])).toBe('1.000');
    expect(formatFieldingPct({ po: 0, a: 0, e: 0 })).toBe('—');
    expect(formatFieldingPct({ po: 0, a: 0, e: 1 })).toBe('.000');
  });
});

describe('playsByInning / currentDefenseInning', () => {
  it('numbers outs within an inning and advances after three', () => {
    const plays = [play(1, 'strikeout', [2]), play(1, 'single', []), play(1, 'double_play', [6, 4, 3])];
    const list = playsByInning(plays).get(1)!;
    expect(list.map((x) => x.outNumbers)).toEqual([[1], [], [2, 3]]);
    expect(currentDefenseInning(plays)).toBe(2);
    expect(currentDefenseInning(plays.slice(0, 2))).toBe(1);
    expect(currentDefenseInning([])).toBe(1);
    expect(currentDefenseInning([play(30, 'triple_play', [6])])).toBe(30);
  });
});

describe('applyPositionChanges', () => {
  const base = new Map([
    [4, 'amy'],
    [6, 'bob'],
  ]);
  const obj = (m: Map<number, string>) => Object.fromEntries(m);

  it('moves a player and clears their old position', () => {
    expect(obj(applyPositionChanges(base, [[5, 'amy']]))).toEqual({ 5: 'amy', 6: 'bob' });
  });
  it('swaps two players with two changes', () => {
    expect(obj(applyPositionChanges(base, [[6, 'amy'], [4, 'bob']]))).toEqual({ 4: 'bob', 6: 'amy' });
  });
  it('replaces and clears', () => {
    expect(obj(applyPositionChanges(base, [[6, 'cat']]))).toEqual({ 4: 'amy', 6: 'cat' });
    expect(obj(applyPositionChanges(base, [[4, null]]))).toEqual({ 6: 'bob' });
  });
  it('does not mutate the input', () => {
    applyPositionChanges(base, [[4, null]]);
    expect(obj(base)).toEqual({ 4: 'amy', 6: 'bob' });
  });
});
