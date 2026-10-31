import { describe, expect, it } from 'vitest';
import { RunnerEvent, checkRunnersOnBases, computeBases, defaultMoves, nextTurn } from '@/lib/baserunning';
import { computeStats, resultToFields } from '@/lib/atbat';
import { checkExpected, parseExpectedLast } from '@/lib/conflict';
import { expectedLastFor } from '@/lib/offlineQueue';
import { latestAction, parseUndoRequest, sameTarget, withoutTarget } from '@/lib/undo';
import { isUuid } from '@/lib/baserunning';
import {
  Substitution,
  battingOrders,
  benchPlayers,
  boxScoreRows,
  checkSubstitution,
  formerBySlot,
  formerNamesForSlot,
  inningLabel,
  nextSlotNumber,
  offenseHalf,
  parseSubstitutionInput,
  slotOfPlayer,
} from '@/lib/substitution';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GAME = uuid(100);
const A = uuid(1);
const B = uuid(2);
const C = uuid(3);
const PR = uuid(7); // 代跑
const PH = uuid(8); // 代打
const X = uuid(9); // 加棒次
const PR2 = uuid(10); // 第二位代跑

const at = (sec: number) => `2026-11-01T10:00:${String(sec).padStart(2, '0')}.000000+00:00`;
const ref = (name: string) => ({ name, number: null });

function ev(id: string, play: string, atbatId: string | null, playerId: string, from: number, to: number | null, created: string, inning = 1): RunnerEvent {
  return {
    id,
    game_id: GAME,
    atbat_id: atbatId,
    play_id: play,
    inning,
    runner_player_id: playerId,
    from_base: from,
    to_base: to,
    event_type: atbatId ? (from === 0 ? 'batter' : 'runner') : 'other',
    created_at: created,
    players: ref(playerId),
  };
}

function sub(partial: Partial<Substitution> & Pick<Substitution, 'id' | 'sub_type' | 'batting_order' | 'created_at'>): Substitution {
  return {
    game_id: GAME,
    client_id: null,
    out_player_id: null,
    in_player_id: null,
    inning: 1,
    half: 'top',
    base: null,
    out_player: null,
    in_player: null,
    ...partial,
  };
}

const atbat = (id: string, playerId: string, order: number, created: string, code: Parameters<typeof resultToFields>[0] = 'single', inning = 1) => ({
  id,
  player_id: playerId,
  batting_order: order,
  inning,
  rbi: 0,
  created_at: created,
  players: ref(playerId),
  ...resultToFields(code),
});

describe('打序輪轉：加棒次', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ batting_order: i + 1 }));

  it('第 10 棒加入後，第 9 棒打完輪到第 10 棒，再回到第 1 棒', () => {
    const lineup = [...nine, { batting_order: 10 }];
    const orders = battingOrders(lineup);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(nextTurn([atbat('a9', A, 9, at(1))], [], orders).slot).toBe(10);
    expect(nextTurn([atbat('a10', A, 10, at(2))], [], orders).slot).toBe(1);
  });

  it('打序資料順序亂掉也依棒次排序；第 11 棒接在第 10 棒之後', () => {
    const lineup = [{ batting_order: 11 }, ...nine.slice().reverse(), { batting_order: 10 }];
    const orders = battingOrders(lineup);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(nextTurn([atbat('a', A, 10, at(1))], [], orders).slot).toBe(11);
    expect(nextTurn([atbat('a', A, 11, at(1))], [], orders).slot).toBe(1);
  });

  it('還沒打到最後一棒時加棒次：照順序往下打', () => {
    const orders = battingOrders([...nine, { batting_order: 10 }]);
    expect(nextTurn([atbat('a', A, 5, at(1))], [], orders).slot).toBe(6);
  });

  it('下一個棒次是最後一棒 + 1，最多 20 棒', () => {
    expect(nextSlotNumber(nine)).toBe(10);
    expect(nextSlotNumber([])).toBe(1);
    expect(nextSlotNumber(Array.from({ length: 20 }, (_, i) => ({ batting_order: i + 1 })))).toBeNull();
  });
});

describe('代跑：壘包與之後的跑壘', () => {
  // 1 局：A 二壘安打 → 代跑 PR 換上二壘的 A → B 一壘安打（PR 上三壘）
  const events = [
    ev('e1', 'p1', 'a1', A, 0, 2, at(1)),
    ev('e2', 'p2', 'a2', B, 0, 1, at(20)),
    ev('e3', 'p2', 'a2', PR, 2, 3, at(20)),
  ];
  const pr = sub({
    id: 's1',
    sub_type: 'pinch_runner',
    batting_order: 1,
    out_player_id: A,
    in_player_id: PR,
    in_player: ref('代跑'),
    base: 2,
    created_at: at(10),
  });

  it('換人後壘上是代跑者', () => {
    const bases = computeBases(events.slice(0, 1), 1, [pr]);
    expect(bases[2]).toEqual({ playerId: PR, player: ref('代跑') });
  });

  it('之後的推進用代跑者，原跑者不會留在壘上', () => {
    const bases = computeBases(events, 1, [pr]);
    expect(bases[3]?.playerId).toBe(PR);
    expect(bases[1]?.playerId).toBe(B);
    expect(bases[2]).toBeNull();
    expect([1, 2, 3].map((b) => bases[b]?.playerId)).not.toContain(A);
  });

  it('打席後的跑者去向預設帶出代跑者（送到伺服器的也是代跑者）', () => {
    const bases = computeBases(events.slice(0, 1), 1, [pr]);
    const moves = defaultMoves('single', bases, { playerId: B, player: null });
    expect(moves.find((m) => m.from === 2)?.playerId).toBe(PR);
    const inputs = moves.map((m) => ({ runner_player_id: m.playerId, from_base: m.from, to_base: m.to }));
    expect(checkRunnersOnBases(inputs, bases)).toBeNull();
    // 沒有代跑紀錄的舊壘包（原跑者 A）會被擋下
    expect(checkRunnersOnBases(inputs, computeBases(events.slice(0, 1), 1))).toMatch('跑者與紀錄不符');
  });

  it('其他局的代跑不影響這一局；換局後壘包清空', () => {
    expect(computeBases(events.slice(0, 1), 1, [{ ...pr, inning: 2 }])[2]?.playerId).toBe(A);
    expect(computeBases(events, 2, [pr])).toEqual([null, null, null, null]);
  });

  it('代跑在推進之前：依時間穿插重播', () => {
    // 代跑時間晚於 B 的安打：當時 A 已經在三壘，壘包對不上就用球員找
    const late = { ...pr, created_at: at(30) };
    const moved = [ev('e1', 'p1', 'a1', A, 0, 2, at(1)), ev('e2', 'p2', 'a2', B, 0, 1, at(20)), ev('e3', 'p2', 'a2', A, 2, 3, at(20))];
    expect(computeBases(moved, 1, [late])[3]?.playerId).toBe(PR);
  });

  it('撤銷代跑（刪除換人紀錄）後壘上回到原跑者', () => {
    expect(computeBases(events.slice(0, 1), 1, [])[2]?.playerId).toBe(A);
  });

  it('代跑者接手原跑者的棒次', () => {
    const lineup = [
      { batting_order: 1, player_id: A, players: null },
      { batting_order: 2, player_id: B, players: null },
    ];
    expect(slotOfPlayer(lineup, A)).toBe(1);
    expect(slotOfPlayer(lineup, C)).toBeNull();
  });
});

describe('同一棒同局連續換人', () => {
  it('代打上壘後同局再被代跑：壘包、推進、得分都跟著換人', () => {
    // 1 局：第 3 棒 A 被 PH 代打 → PH 一壘安打 → PR 代跑 PH → B 二壘安打（PR 上三壘）→ C 安打（PR 得分）
    const subs = [
      sub({ id: 's1', sub_type: 'pinch_hitter', batting_order: 3, out_player_id: A, out_player: ref('A'), in_player_id: PH, in_player: ref('PH'), created_at: at(5) }),
      sub({ id: 's2', sub_type: 'pinch_runner', batting_order: 3, out_player_id: PH, out_player: ref('PH'), in_player_id: PR, in_player: ref('PR'), base: 1, created_at: at(15) }),
    ];
    const events = [
      ev('e1', 'p1', 'a1', PH, 0, 1, at(10)),
      ev('e2', 'p2', 'a2', B, 0, 2, at(20)),
      ev('e3', 'p2', 'a2', PR, 1, 3, at(20)),
      ev('e4', 'p3', 'a3', C, 0, 1, at(30)),
      ev('e5', 'p3', 'a3', PR, 3, 4, at(30)),
    ];
    const runnerSubs = subs.filter((x) => x.sub_type === 'pinch_runner');
    expect(computeBases(events.slice(0, 1), 1, runnerSubs)[1]?.playerId).toBe(PR);
    expect(computeBases(events.slice(0, 3), 1, runnerSubs)[3]?.playerId).toBe(PR);
    const final = computeBases(events, 1, runnerSubs);
    expect([1, 2, 3].map((b) => final[b]?.playerId)).toEqual([C, B, undefined]);

    expect(formerBySlot(subs).get(3)!.map((f) => f.playerId)).toEqual([A, PH]);
    const lineup = [
      { batting_order: 1, player_id: B, players: ref('B') },
      { batting_order: 2, player_id: C, players: ref('C') },
      { batting_order: 3, player_id: PR, players: ref('PR') },
    ];
    const atbats = [atbat('a0', A, 3, at(1), 'strikeout'), atbat('a1', PH, 3, at(10))];
    expect(boxScoreRows(lineup, subs, atbats).map((r) => [r.playerId, r.slot, r.current])).toEqual([
      [B, 1, true],
      [C, 2, true],
      [A, 3, false],
      [PH, 3, false],
      [PR, 3, true],
    ]);
  });

  it('同一位跑者連續兩次代跑（PR1 代跑 A，PR2 再代跑 PR1）：依序換到 PR2', () => {
    const events = [ev('e1', 'p1', 'a1', A, 0, 2, at(1)), ev('e2', 'p2', 'a2', B, 0, 1, at(30)), ev('e3', 'p2', 'a2', PR2, 2, 3, at(30))];
    const subs = [
      sub({ id: 's1', sub_type: 'pinch_runner', batting_order: 1, out_player_id: A, in_player_id: PR, base: 2, created_at: at(10) }),
      sub({ id: 's2', sub_type: 'pinch_runner', batting_order: 1, out_player_id: PR, in_player_id: PR2, in_player: ref('PR2'), base: 2, created_at: at(20) }),
    ];
    expect(computeBases(events.slice(0, 1), 1, subs)[2]).toEqual({ playerId: PR2, player: ref('PR2') });
    // 資料順序亂掉也依時間套用
    expect(computeBases(events.slice(0, 1), 1, [subs[1], subs[0]])[2]?.playerId).toBe(PR2);
    const after = computeBases(events, 1, subs);
    expect(after[3]?.playerId).toBe(PR2);
    expect([1, 2, 3].map((b) => after[b]?.playerId)).not.toContain(PR);
  });

  it('還沒同步的預覽紀錄（手機時間比伺服器慢）一律排在代跑之後', () => {
    // 代跑在伺服器時間 at(20)，之後這支手機記的推進用手機時間 at(15)
    const pr = sub({ id: 's1', sub_type: 'pinch_runner', batting_order: 1, out_player_id: A, in_player_id: PR, base: 2, created_at: at(20) });
    // 之後（都還沒同步）：PR 得分，打完一輪 A 再上場後上一壘
    const events = [
      ev('e1', 'p1', 'a1', A, 0, 2, at(1)),
      ev('pending:c1:2', 'c1', 'pending:c1', PR, 2, 4, at(15)),
      ev('pending:c2:0', 'c2', 'pending:c2', A, 0, 1, at(16)),
    ];
    const bases = computeBases(events, 1, [pr]);
    // 代跑不會被延後套用到再上壘的 A 身上
    expect(bases[1]?.playerId).toBe(A);
    expect([1, 2, 3].map((b) => bases[b]?.playerId)).not.toContain(PR);
  });
});

describe('已退場球員再上場', () => {
  // 第 3 棒：A 先發 → B 換下 A → A 再換下 B
  const subs = [
    sub({ id: 's1', sub_type: 'replace', batting_order: 3, out_player_id: A, out_player: ref('A'), in_player_id: B, in_player: ref('B'), created_at: at(10) }),
    sub({ id: 's2', sub_type: 'replace', batting_order: 3, out_player_id: B, out_player: ref('B'), in_player_id: A, in_player: ref('A'), created_at: at(20) }),
  ];
  const lineup = [
    { batting_order: 1, player_id: C, players: ref('C') },
    { batting_order: 3, player_id: A, players: ref('A') },
  ];

  it('本場成績：目前在場上的 A 是 current，不標退場', () => {
    const rows = boxScoreRows(lineup, subs, [atbat('a1', A, 3, at(1)), atbat('a2', B, 3, at(15))]);
    expect(rows.map((r) => [r.playerId, r.slot, r.current])).toEqual([
      [C, 1, true],
      [B, 3, false],
      [A, 3, true],
    ]);
  });

  it('打序列的刪除線不再列出目前的球員，同一人只列一次', () => {
    const former = formerBySlot(subs).get(3)!;
    expect(formerNamesForSlot(former, A).map((f) => f.playerId)).toEqual([B]);
    const again = formerBySlot([
      ...subs,
      sub({ id: 's3', sub_type: 'replace', batting_order: 3, out_player_id: A, in_player_id: B, created_at: at(30) }),
    ]).get(3)!;
    expect(formerNamesForSlot(again, B).map((f) => f.playerId)).toEqual([A]);
  });
});

describe('成績歸屬', () => {
  // 第 3 棒：A 先發打了兩個打席，4 局上被 PH 代打，PH 之後打了一個打席
  const lineupAfter = [
    { batting_order: 1, player_id: B, players: ref('B') },
    { batting_order: 3, player_id: PH, players: ref('PH') },
    { batting_order: 2, player_id: C, players: ref('C') },
  ];
  const subs = [
    sub({ id: 's1', sub_type: 'pinch_hitter', batting_order: 3, out_player_id: A, out_player: ref('A'), in_player_id: PH, in_player: ref('PH'), inning: 4, created_at: at(30) }),
  ];
  const atbats = [
    atbat('a1', A, 3, at(1), 'double'),
    atbat('a2', A, 3, at(10), 'strikeout'),
    atbat('a3', PH, 3, at(40), 'homerun'),
  ];

  it('換人前的打席仍算原球員，代打者只有換人後的打席', () => {
    const a = computeStats(atbats.filter((x) => x.player_id === A));
    expect(a).toMatchObject({ pa: 2, ab: 2, h: 1, b2: 1, so: 1 });
    const ph = computeStats(atbats.filter((x) => x.player_id === PH));
    expect(ph).toMatchObject({ pa: 1, h: 1, hr: 1 });
  });

  it('本場成績依棒次排列：先列被換下的原球員，再列目前的球員', () => {
    const rows = boxScoreRows(lineupAfter, subs, atbats);
    expect(rows.map((r) => [r.playerId, r.slot, r.current])).toEqual([
      [B, 1, true],
      [C, 2, true],
      [A, 3, false],
      [PH, 3, true],
    ]);
  });

  it('同一棒換了兩次：依時間列出', () => {
    const more = [
      ...subs,
      sub({ id: 's2', sub_type: 'replace', batting_order: 3, out_player_id: PH, out_player: ref('PH'), in_player_id: X, created_at: at(50) }),
    ];
    const former = formerBySlot(more).get(3)!;
    expect(former.map((f) => f.playerId)).toEqual([A, PH]);
    const lineup = lineupAfter.map((l) => (l.batting_order === 3 ? { ...l, player_id: X, players: ref('X') } : l));
    expect(boxScoreRows(lineup, more, atbats).filter((r) => r.slot === 3).map((r) => r.playerId)).toEqual([A, PH, X]);
  });

  it('加棒次不算換下任何人；不在任何棒次紀錄的打者排在最後', () => {
    const added = [sub({ id: 's3', sub_type: 'add_slot', batting_order: 10, in_player_id: X, created_at: at(60) })];
    expect(formerBySlot(added).size).toBe(0);
    const rows = boxScoreRows([{ batting_order: 1, player_id: B, players: null }], [], [atbat('z', C, 5, at(1))]);
    expect(rows.map((r) => [r.playerId, r.slot])).toEqual([[B, 1], [C, null]]);
  });

  it('可換上場的球員：目前不在打序上的人（包含已退場的）', () => {
    const players = [{ id: A }, { id: B }, { id: PH }, { id: X }];
    expect(benchPlayers(players, lineupAfter).map((p) => p.id)).toEqual([A, X]);
  });
});

describe('撤銷：換人也是一筆動作', () => {
  const atbats = [atbat('a1', A, 1, at(1))];
  const events = [ev('e1', 'p1', 'a1', A, 0, 1, at(1))];
  const s1 = sub({ id: uuid(50), sub_type: 'pinch_runner', batting_order: 1, out_player_id: A, in_player_id: PR, base: 1, created_at: at(5) });

  it('換人在最後：撤銷目標是換人', () => {
    expect(latestAction(atbats, events, [s1])).toEqual({ kind: 'sub', id: s1.id, created_at: at(5) });
  });

  it('換人之後又記了打席/跑壘：撤銷目標是打席/跑壘', () => {
    expect(latestAction([...atbats, atbat('a2', B, 2, at(9))], events, [s1])).toMatchObject({ kind: 'atbat', id: 'a2' });
    expect(latestAction(atbats, [...events, ev('e9', 'p9', null, PR, 1, 2, at(9))], [s1])).toMatchObject({ kind: 'play', play_id: 'p9' });
  });

  it('沒有換人紀錄（migration 未執行）時和以前一樣', () => {
    expect(latestAction(atbats, events)).toMatchObject({ kind: 'atbat', id: 'a1' });
    expect(latestAction([], [], [s1])).toMatchObject({ kind: 'sub' });
  });

  it('撤銷換人不動打席與跑壘；拿掉換人後最後一筆回到打席', () => {
    const target = latestAction(atbats, events, [s1])!;
    const after = withoutTarget(atbats, events, target);
    expect(after).toEqual({ atbats, events });
    expect(latestAction(after.atbats, after.events, [])).toMatchObject({ kind: 'atbat', id: 'a1' });
  });

  it('sameTarget / parseUndoRequest 支援換人', () => {
    expect(sameTarget({ kind: 'sub', id: 'x' }, { kind: 'sub', id: 'x' })).toBe(true);
    expect(sameTarget({ kind: 'sub', id: 'x' }, { kind: 'atbat', id: 'x' })).toBe(false);
    expect(parseUndoRequest({ kind: 'sub', id: s1.id }, isUuid)).toEqual({ kind: 'sub', id: s1.id });
    expect(parseUndoRequest({ kind: 'sub', id: 'nope' }, isUuid)).toBeNull();
  });
});

describe('衝突檢查（409）包含換人', () => {
  const atbats = [atbat(uuid(60), A, 1, at(1))];
  const s1 = sub({ id: uuid(50), sub_type: 'pinch_hitter', batting_order: 2, out_player_id: B, in_player_id: PH, created_at: at(5) });

  it('換人之後記錄的打席帶 expected_last = 這次換人', () => {
    expect(expectedLastFor(atbats, [], [], [s1])).toEqual({ kind: 'sub', id: s1.id });
    expect(parseExpectedLast({ kind: 'sub', id: s1.id }, isUuid)).toEqual({ kind: 'sub', id: s1.id });
    expect(parseExpectedLast({ kind: 'sub', id: 'x' }, isUuid)).toBe(false);
  });

  it('依換人前的畫面記的打席（其他裝置剛換人）：409', async () => {
    const latest = { kind: 'sub' as const, id: s1.id };
    expect(await checkExpected({ kind: 'atbat', id: uuid(60) }, latest, async () => null)).toMatchObject({ ok: false });
    expect(await checkExpected({ kind: 'sub', id: s1.id }, latest, async () => null)).toEqual({ ok: true });
  });
});

describe('parseSubstitutionInput', () => {
  const base = { game_id: GAME, client_id: uuid(70), batting_order: 3, out_player_id: A, in_player_id: PH, inning: 4, half: 'top' };

  it('代打', () => {
    expect(parseSubstitutionInput({ ...base, sub_type: 'pinch_hitter' })).toEqual({
      value: { ...base, sub_type: 'pinch_hitter', base: null },
    });
  });

  it('代跑一定要有壘包與局數', () => {
    expect(parseSubstitutionInput({ ...base, sub_type: 'pinch_runner' })).toEqual({ error: '請選擇要代跑的壘包' });
    expect(parseSubstitutionInput({ ...base, sub_type: 'pinch_runner', base: 2, inning: null })).toEqual({ error: '代跑需要局數' });
    expect(parseSubstitutionInput({ ...base, sub_type: 'pinch_runner', base: 2 })).toMatchObject({ value: { base: 2 } });
    expect(parseSubstitutionInput({ ...base, sub_type: 'pinch_hitter', base: 2 })).toEqual({ error: '只有代跑需要壘包' });
  });

  it('加棒次沒有換下的球員', () => {
    expect(parseSubstitutionInput({ ...base, sub_type: 'add_slot', out_player_id: null, batting_order: 10 })).toMatchObject({
      value: { sub_type: 'add_slot', out_player_id: null, batting_order: 10 },
    });
    expect(parseSubstitutionInput({ ...base, sub_type: 'add_slot' })).toEqual({ error: '加棒次沒有換下的球員' });
  });

  it('擋下格式錯誤', () => {
    expect(parseSubstitutionInput(null)).toMatchObject({ error: expect.any(String) });
    expect(parseSubstitutionInput({ ...base, sub_type: 'steal' })).toEqual({ error: '請選擇換人方式' });
    expect(parseSubstitutionInput({ ...base, sub_type: 'replace', batting_order: 21 })).toEqual({ error: '棒次錯誤' });
    expect(parseSubstitutionInput({ ...base, sub_type: 'replace', batting_order: '3' })).toEqual({ error: '棒次錯誤' });
    expect(parseSubstitutionInput({ ...base, sub_type: 'replace', in_player_id: A })).toEqual({ error: '換上和換下的是同一位球員' });
    expect(parseSubstitutionInput({ ...base, sub_type: 'replace', half: 'middle' })).toEqual({ error: '半局錯誤' });
    expect(parseSubstitutionInput({ ...base, sub_type: 'replace', client_id: 'x' })).toEqual({ error: 'client_id 格式錯誤' });
  });
});

describe('checkSubstitution（以伺服器目前打序檢查）', () => {
  const lineup = [
    { batting_order: 1, player_id: A },
    { batting_order: 2, player_id: B },
  ];
  const input = {
    client_id: null,
    game_id: GAME,
    sub_type: 'replace' as const,
    batting_order: 2,
    out_player_id: B,
    in_player_id: X,
    inning: 3,
    half: 'bottom' as const,
    base: null,
  };

  it('打序和畫面一致時通過', () => {
    expect(checkSubstitution(input, lineup, null)).toBeNull();
  });

  it('這一棒已被其他裝置換掉：409', () => {
    expect(checkSubstitution({ ...input, out_player_id: C }, lineup, null)).toMatchObject({ status: 409 });
  });

  it('換上的人已經在打序上：400', () => {
    expect(checkSubstitution({ ...input, in_player_id: A }, lineup, null)).toMatchObject({ status: 400 });
  });

  it('加棒次：只能接在最後一棒之後、而且還沒有人', () => {
    const add = { ...input, sub_type: 'add_slot' as const, out_player_id: null };
    expect(checkSubstitution({ ...add, batting_order: 3 }, lineup, null)).toBeNull();
    expect(checkSubstitution({ ...add, batting_order: 2 }, lineup, null)).toMatchObject({ status: 409 });
    expect(checkSubstitution({ ...add, batting_order: 5 }, lineup, null)).toMatchObject({ status: 409 });
  });

  it('代跑：跑者必須真的在那個壘包上', () => {
    const pr = { ...input, sub_type: 'pinch_runner' as const, batting_order: 1, out_player_id: A, base: 2 };
    const bases = computeBases([ev('e1', 'p1', 'a1', A, 0, 2, at(1))], 1);
    expect(checkSubstitution(pr, lineup, bases)).toBeNull();
    expect(checkSubstitution({ ...pr, base: 1 }, lineup, bases)).toMatchObject({ status: 409 });
    expect(checkSubstitution(pr, lineup, computeBases([ev('e1', 'p1', 'a1', B, 0, 2, at(1))], 1))).toMatchObject({ status: 409 });
  });

  it('一般替換不能換壘上的跑者（要用代跑）', () => {
    const onBase = computeBases([ev('e1', 'p1', 'a1', B, 0, 2, at(1))], 1);
    expect(checkSubstitution(input, lineup, onBase)).toMatchObject({ status: 409, error: expect.stringContaining('代跑') });
    // 不在壘上的人照常替換
    expect(checkSubstitution(input, lineup, computeBases([ev('e1', 'p1', 'a1', A, 0, 2, at(1))], 1))).toBeNull();
  });
});

describe('顯示', () => {
  it('局數與半局', () => {
    expect(inningLabel(3, 'top')).toBe('3 局上');
    expect(inningLabel(3, 'bottom')).toBe('3 局下');
    expect(inningLabel(null, 'top')).toBe('');
    expect(offenseHalf('away')).toBe('top');
    expect(offenseHalf('home')).toBe('bottom');
  });
});
