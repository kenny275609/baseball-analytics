import { describe, expect, it } from 'vitest';
import { ResultCode, resultToFields } from '@/lib/atbat';
import {
  Bases,
  EMPTY_BASES,
  RunnerEvent,
  RunnerEventType,
  RunnerMove,
  STANDALONE_EVENTS,
  autoRbi,
  batterEventPatch,
  checkRunnersOnBases,
  computeBases,
  defaultMoves,
  isStandaloneType,
  isTracked,
  isUuid,
  movesOuts,
  nextTurn,
  movedRunners,
  outsInInning,
  parseAllRunnerInputs,
  parseRunnerInputs,
  runsByInning,
  standaloneDefaults,
  validateMoves,
} from '@/lib/baserunning';

// ============================================
// 測試工具
// ============================================

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = uuid(1);
const B = uuid(2);
const C = uuid(3);
const D = uuid(4);
const BATTER = uuid(9);

const runner = (id: string) => ({ playerId: id, player: null });
const batter = runner(BATTER);

function bases(b1: string | null, b2: string | null, b3: string | null): Bases {
  return [null, b1 ? runner(b1) : null, b2 ? runner(b2) : null, b3 ? runner(b3) : null];
}

function ids(b: Bases): (string | null)[] {
  return [b[1]?.playerId ?? null, b[2]?.playerId ?? null, b[3]?.playerId ?? null];
}

// 依 from 取出去向，方便斷言
function dest(moves: RunnerMove[]): Record<number, number | null> {
  return Object.fromEntries(moves.map((m) => [m.from, m.to]));
}

let seq = 0;
function ev(
  inning: number,
  playId: string,
  playerId: string | null,
  from: number,
  to: number | null,
  extra: Partial<RunnerEvent> = {}
): RunnerEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    game_id: 'g',
    atbat_id: null,
    play_id: playId,
    inning,
    runner_player_id: playerId,
    from_base: from,
    to_base: to,
    event_type: from === 0 ? 'batter' : 'runner',
    created_at: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
    ...extra,
  };
}

type TestAtbat = ReturnType<typeof resultToFields> & { id: string; inning: number | null; batting_order: number | null };

// 小型比賽模擬：走跟頁面一樣的流程（預設去向 → 驗證 → API 解析 → 事件 → 推進局數）
class Sim {
  atbats: TestAtbat[] = [];
  events: RunnerEvent[] = [];
  inning = 1;
  private n = 0;

  bases() {
    return computeBases(this.events, this.inning);
  }
  outs() {
    return outsInInning(this.atbats, this.events, this.inning);
  }

  atbat(code: ResultCode, batterId = BATTER, adjust?: (m: RunnerMove[]) => RunnerMove[]) {
    let moves = defaultMoves(code, this.bases(), runner(batterId), this.outs());
    if (adjust) moves = adjust(moves);
    expect(validateMoves(moves)).toBeNull();
    const raw = moves.map((m) => ({ player_id: m.playerId, from_base: m.from, to_base: m.to }));
    const inputs = parseRunnerInputs(raw, true);
    expect(inputs).not.toBeNull();
    // 伺服器端用重播的壘包再驗一次
    expect(checkRunnersOnBases(parseAllRunnerInputs(raw, true)!, this.bases())).toBeNull();
    const id = `ab${++this.n}`;
    const play = `p${this.n}`;
    this.atbats.push({ id, inning: this.inning, batting_order: (this.atbats.length % 9) + 1, ...resultToFields(code) });
    for (const r of inputs!) {
      this.events.push(ev(this.inning, play, r.from_base === 0 ? batterId : r.runner_player_id, r.from_base, r.to_base, { atbat_id: id }));
    }
    this.advance();
    return { moves, rbi: autoRbi(code, moves) };
  }

  standalone(type: RunnerEventType, adjust?: (m: RunnerMove[]) => RunnerMove[]) {
    let moves = standaloneDefaults(type, this.bases());
    if (adjust) moves = adjust(moves);
    const raw = moves.map((m) => ({ player_id: m.playerId, from_base: m.from, to_base: m.to }));
    const inputs = parseRunnerInputs(raw, false);
    expect(inputs).not.toBeNull();
    expect(checkRunnersOnBases(parseAllRunnerInputs(raw, false)!, this.bases())).toBeNull();
    const play = `s${++this.n}`;
    for (const r of inputs!) {
      this.events.push(ev(this.inning, play, r.runner_player_id, r.from_base, r.to_base, { event_type: type }));
    }
    this.advance();
  }

  // 刪除最後一個打席（跑壘事件由 FK cascade 一起刪）
  deleteLastAtbat() {
    const last = this.atbats.pop()!;
    this.events = this.events.filter((e) => e.atbat_id !== last.id);
    this.inning = nextTurn(this.atbats, this.events, [1, 2, 3, 4, 5, 6, 7, 8, 9]).inning;
  }

  private advance() {
    this.inning = nextTurn(this.atbats, this.events, [1, 2, 3, 4, 5, 6, 7, 8, 9]).inning;
  }
}

const set = (from: number, to: number | null) => (moves: RunnerMove[]) =>
  moves.map((m) => (m.from === from ? { ...m, to } : m));

// ============================================
// 壘包推算
// ============================================

describe('computeBases', () => {
  it('同一 play 的一壘→二壘、二壘→三壘不會互相覆蓋', () => {
    const events = [ev(1, 'p1', A, 0, 1), ev(1, 'p2', B, 0, 1), ev(1, 'p2', A, 1, 2)];
    expect(ids(computeBases(events, 1))).toEqual([B, A, null]);

    // 一壘→二壘先寫、二壘→三壘後寫（先拿起來再放下）
    const more = [...events, ev(1, 'p3', C, 0, 1), ev(1, 'p3', B, 1, 2), ev(1, 'p3', A, 2, 3)];
    expect(ids(computeBases(more, 1))).toEqual([C, B, A]);

    // 反過來的寫入順序結果也一樣
    const reversed = [...events, ev(1, 'p3', A, 2, 3), ev(1, 'p3', B, 1, 2), ev(1, 'p3', C, 0, 1)];
    expect(ids(computeBases(reversed, 1))).toEqual([C, B, A]);
  });

  it('得分與出局的跑者離開壘包', () => {
    const events = [
      ev(1, 'p1', A, 0, 3),
      ev(1, 'p2', B, 0, 1),
      ev(1, 'p3', C, 0, 1),
      ev(1, 'p3', B, 1, null),
      ev(1, 'p3', A, 3, 4),
    ];
    expect(ids(computeBases(events, 1))).toEqual([C, null, null]);
  });

  it('只重播該局事件，換局清空', () => {
    const events = [ev(1, 'p1', A, 0, 2), ev(1, 'p2', B, 0, 1)];
    expect(ids(computeBases(events, 1))).toEqual([B, A, null]);
    expect(computeBases(events, 2)).toEqual(EMPTY_BASES);
  });

  it('沒有事件時壘包為空', () => {
    expect(computeBases([], 1)).toEqual(EMPTY_BASES);
  });

  it('帶上跑者的名字', () => {
    const e = ev(1, 'p1', A, 0, 1, { players: { name: '王小明', number: '7' } });
    expect(computeBases([e], 1)[1]).toEqual({ playerId: A, player: { name: '王小明', number: '7' } });
  });
});

// ============================================
// 各結果的預設去向
// ============================================

describe('defaultMoves', () => {
  it('壘上無人一壘安打：打者上一壘', () => {
    expect(defaultMoves('single', EMPTY_BASES, batter)).toEqual([
      { playerId: BATTER, player: null, from: 0, to: 1 },
    ]);
  });

  it('一壘安打：所有跑者推進一個壘，三壘跑者得分', () => {
    expect(dest(defaultMoves('single', bases(A, B, C), batter))).toEqual({ 0: 1, 1: 2, 2: 3, 3: 4 });
  });

  it('二壘安打：跑者推進兩個壘', () => {
    expect(dest(defaultMoves('double', bases(A, B, null), batter))).toEqual({ 0: 2, 1: 3, 2: 4 });
  });

  it('三壘安打：所有跑者回來得分', () => {
    expect(dest(defaultMoves('triple', bases(A, null, C), batter))).toEqual({ 0: 3, 1: 4, 3: 4 });
  });

  it('全壘打與滿貫全壘打', () => {
    expect(dest(defaultMoves('homerun', EMPTY_BASES, batter))).toEqual({ 0: 4 });
    const slam = defaultMoves('homerun', bases(A, B, C), batter);
    expect(dest(slam)).toEqual({ 0: 4, 1: 4, 2: 4, 3: 4 });
    expect(autoRbi('homerun', slam)).toBe(4);
  });

  it('保送／觸身：滿壘擠回一分', () => {
    for (const code of ['walk', 'hit_by_pitch'] as const) {
      const moves = defaultMoves(code, bases(A, B, C), batter);
      expect(dest(moves)).toEqual({ 0: 1, 1: 2, 2: 3, 3: 4 });
      expect(autoRbi(code, moves)).toBe(1);
    }
  });

  it('保送：一三壘有人只推一壘跑者', () => {
    const moves = defaultMoves('walk', bases(A, null, C), batter);
    expect(dest(moves)).toEqual({ 0: 1, 1: 2, 3: 3 });
    expect(autoRbi('walk', moves)).toBe(0);
  });

  it('保送：只有二壘或三壘有人時不被迫進壘', () => {
    expect(dest(defaultMoves('walk', bases(null, B, null), batter))).toEqual({ 0: 1, 2: 2 });
    expect(dest(defaultMoves('hit_by_pitch', bases(null, B, C), batter))).toEqual({ 0: 1, 2: 2, 3: 3 });
    expect(dest(defaultMoves('walk', bases(A, B, null), batter))).toEqual({ 0: 1, 1: 2, 2: 3 });
  });

  it('失誤上壘：跑者各推進一個壘、不給打點', () => {
    const moves = defaultMoves('error', bases(null, B, C), batter);
    expect(dest(moves)).toEqual({ 0: 1, 2: 3, 3: 4 });
    expect(autoRbi('error', moves)).toBe(0);
  });

  it('野手選擇：一壘跑者被封殺，其他被迫跑者推進', () => {
    expect(dest(defaultMoves('fielders_choice', bases(A, null, null), batter))).toEqual({ 0: 1, 1: null });
    expect(dest(defaultMoves('fielders_choice', bases(A, B, null), batter))).toEqual({ 0: 1, 1: null, 2: 3 });
    // 三壘跑者沒有被迫，留在原壘
    expect(dest(defaultMoves('fielders_choice', bases(A, null, C), batter))).toEqual({ 0: 1, 1: null, 3: 3 });
  });

  it('野手選擇：一壘沒人時最前面的跑者出局', () => {
    expect(dest(defaultMoves('fielders_choice', bases(null, B, null), batter))).toEqual({ 0: 1, 2: null });
    expect(dest(defaultMoves('fielders_choice', bases(null, B, C), batter))).toEqual({ 0: 1, 2: 2, 3: null });
  });

  it('雙殺：打者與一壘跑者出局，其他跑者留在原壘、不給打點', () => {
    const moves = defaultMoves('double_play', bases(A, null, C), batter);
    expect(dest(moves)).toEqual({ 0: null, 1: null, 3: 3 });
    expect(movesOuts(moves)).toBe(2);
    // 無出局雙殺時三壘跑者趁機回本壘，也不給打點
    expect(autoRbi('double_play', set(3, 4)(moves))).toBe(0);
  });

  it('三殺：打者與最後面兩位跑者出局', () => {
    const moves = defaultMoves('triple_play', bases(A, B, null), batter);
    expect(dest(moves)).toEqual({ 0: null, 1: null, 2: null });
    expect(movesOuts(moves)).toBe(3);
  });

  it('高飛犧牲打：只有三壘跑者回來得分，其他跑者留原壘、打者出局，打點 1', () => {
    const moves = defaultMoves('sacrifice_fly', bases(A, B, C), batter, 1);
    expect(dest(moves)).toEqual({ 0: null, 1: 1, 2: 2, 3: 4 });
    expect(movesOuts(moves)).toBe(1);
    expect(autoRbi('sacrifice_fly', moves)).toBe(1);
    expect(dest(defaultMoves('sacrifice_fly', bases(null, null, C), batter))).toEqual({ 0: null, 3: 4 });
  });

  it('高飛犧牲打但三壘沒人：打者出局、跑者不動、沒有打點', () => {
    const moves = defaultMoves('sacrifice_fly', bases(A, B, null), batter);
    expect(dest(moves)).toEqual({ 0: null, 1: 1, 2: 2 });
    expect(autoRbi('sacrifice_fly', moves)).toBe(0);
  });

  it('犧牲觸擊：跑者各推進一個壘、打者出局', () => {
    expect(dest(defaultMoves('sacrifice', bases(A, null, null), batter))).toEqual({ 0: null, 1: 2 });
    const moves = defaultMoves('sacrifice', bases(A, B, C), batter, 1);
    expect(dest(moves)).toEqual({ 0: null, 1: 2, 2: 3, 3: 4 });
    expect(autoRbi('sacrifice', moves)).toBe(1);
  });

  it('一壘安打：維持所有跑者推進一個壘', () => {
    expect(dest(defaultMoves('single', bases(A, B, null), batter))).toEqual({ 0: 1, 1: 2, 2: 3 });
  });

  it('失誤：預設打點 0，可手動改', () => {
    const moves = defaultMoves('error', bases(null, null, C), batter);
    expect(dest(moves)).toEqual({ 0: 1, 3: 4 });
    expect(autoRbi('error', moves)).toBe(0);
  });

  it('三振／滾地／飛球出局：打者出局，跑者留在原壘', () => {
    for (const code of ['strikeout', 'groundout', 'flyout'] as const) {
      expect(dest(defaultMoves(code, bases(A, null, C), batter))).toEqual({ 0: null, 1: 1, 3: 3 });
    }
  });

  it('其他：打者上一壘、被迫跑者推進', () => {
    expect(dest(defaultMoves('other', bases(A, null, C), batter))).toEqual({ 0: 1, 1: 2, 3: 3 });
  });

  it('預設去向一定通過驗證', () => {
    const allBases = [
      bases(null, null, null), bases(A, null, null), bases(null, B, null), bases(null, null, C),
      bases(A, B, null), bases(A, null, C), bases(null, B, C), bases(A, B, C),
    ];
    const codes: ResultCode[] = [
      'single', 'double', 'triple', 'homerun', 'walk', 'hit_by_pitch', 'strikeout', 'groundout',
      'flyout', 'out', 'double_play', 'triple_play', 'fielders_choice', 'error', 'sacrifice', 'sacrifice_fly', 'other',
    ];
    for (const b of allBases) for (const code of codes) for (const outs of [0, 1, 2]) {
      expect(validateMoves(defaultMoves(code, b, batter, outs)), `${code} ${ids(b)} ${outs}`).toBeNull();
    }
  });
});

describe('第三出局時的預設行為', () => {
  it('兩出局野選封殺：其他跑者不推進、不得分', () => {
    const moves = defaultMoves('fielders_choice', bases(A, B, C), batter, 2);
    expect(dest(moves)).toEqual({ 0: 1, 1: null, 2: 2, 3: 3 });
    expect(autoRbi('fielders_choice', moves)).toBe(0);
  });

  it('兩出局三振：三壘跑者不得分', () => {
    expect(dest(defaultMoves('strikeout', bases(null, null, C), batter, 2))).toEqual({ 0: null, 3: 3 });
  });

  it('一出局雙殺結束這局：三壘跑者不得分', () => {
    expect(dest(defaultMoves('double_play', bases(A, null, C), batter, 1))).toEqual({ 0: null, 1: null, 3: 3 });
  });

  it('兩出局高飛犧牲打（實際是第三出局）：三壘跑者不預填得分', () => {
    expect(dest(defaultMoves('sacrifice_fly', bases(null, null, C), batter, 2))).toEqual({ 0: null, 3: 3 });
  });

  it('還沒到三出局時照常推進', () => {
    expect(dest(defaultMoves('fielders_choice', bases(A, B, C), batter, 1))).toEqual({ 0: 1, 1: null, 2: 3, 3: 4 });
  });
});

// ============================================
// 打點
// ============================================

describe('autoRbi', () => {
  const m = (from: number, to: number | null): RunnerMove => ({ playerId: null, player: null, from, to });

  it('安打帶回的跑者都算打點', () => {
    expect(autoRbi('single', [m(0, 1), m(2, 4), m(3, 4)])).toBe(2);
    expect(autoRbi('fielders_choice', [m(0, 1), m(1, null), m(3, 4)])).toBe(1);
    expect(autoRbi('groundout', [m(0, null), m(3, 4)])).toBe(1);
  });

  it('失誤、雙殺、三殺不給打點', () => {
    expect(autoRbi('error', [m(0, 1), m(3, 4)])).toBe(0);
    expect(autoRbi('double_play', [m(0, null), m(1, null), m(3, 4)])).toBe(0);
    expect(autoRbi('triple_play', [m(0, null), m(1, null), m(2, null), m(3, 4)])).toBe(0);
  });

  it('三振（不死三振時跑者趁暴投得分）不給打點', () => {
    expect(autoRbi('strikeout', [m(0, 1), m(3, 4)])).toBe(0);
  });

  it('打者自己跑回本壘只有全壘打算打點', () => {
    expect(autoRbi('homerun', [m(0, 4)])).toBe(1);
    // 三壘安打再趁失誤跑回本壘：只算帶回的跑者
    expect(autoRbi('triple', [m(0, 4), m(1, 4)])).toBe(1);
    expect(autoRbi('single', [m(0, 4)])).toBe(0);
  });

  it('最多 4 分', () => {
    expect(autoRbi('homerun', [m(0, 4), m(1, 4), m(2, 4), m(3, 4)])).toBe(4);
  });
});

// ============================================
// 出局數 / 換局 / 得分
// ============================================

describe('出局數、換局與得分（模擬整局）', () => {
  it('跑壘出局計入出局數，3 出局換局並清空壘包', () => {
    const g = new Sim();
    g.atbat('single', A);
    g.atbat('fielders_choice', B); // A 在二壘被封殺
    expect(g.outs()).toBe(1);
    expect(ids(g.bases())).toEqual([B, null, null]);
    g.standalone('caught_stealing', set(1, null)); // B 盜壘失敗
    expect(g.outs()).toBe(2);
    expect(g.bases()).toEqual(EMPTY_BASES);
    g.atbat('walk', C);
    g.atbat('strikeout', D);
    expect(g.inning).toBe(2);
    expect(g.outs()).toBe(0);
    expect(g.bases()).toEqual(EMPTY_BASES);
  });

  it('每局得分與總分', () => {
    const g = new Sim();
    g.atbat('single', A);
    g.atbat('homerun', B); // 2 分
    g.atbat('strikeout');
    g.atbat('strikeout');
    g.atbat('strikeout');
    expect(g.inning).toBe(2);
    g.atbat('walk', A);
    g.atbat('walk', B);
    g.atbat('walk', C);
    const slam = g.atbat('homerun', D); // 滿貫 4 分
    expect(slam.rbi).toBe(4);
    const runs = runsByInning(g.events);
    expect(runs.get(1)).toBe(2);
    expect(runs.get(2)).toBe(4);
    expect([...runs.values()].reduce((s, n) => s + n, 0)).toBe(6);
  });

  it('兩出局野選形成第三出局：預設不算分', () => {
    const g = new Sim();
    g.atbat('strikeout');
    g.atbat('strikeout');
    g.atbat('walk', A);
    g.atbat('walk', B);
    g.atbat('walk', C);
    expect(g.bases().every((b, i) => i === 0 || b)).toBe(true);
    g.atbat('fielders_choice', D);
    expect(runsByInning(g.events).get(1)).toBeUndefined();
    expect(g.inning).toBe(2);
  });

  it('兩出局安打、跑者在本壘前被觸殺：其他跑者先回本壘的分照算（非封殺）', () => {
    const g = new Sim();
    g.atbat('strikeout');
    g.atbat('strikeout');
    g.atbat('single', A);
    g.atbat('single', B); // A 一壘→二壘
    // 一壘安打：二壘 A 先得分，一壘 B 衝三壘被觸殺
    g.atbat('single', C, (m) => set(1, null)(set(2, 4)(m)));
    expect(runsByInning(g.events).get(1)).toBe(1);
    expect(g.inning).toBe(2);
  });

  it('非打擊事件：盜壘、暴投、捕逸、投手犯規、牽制', () => {
    const g = new Sim();
    g.atbat('single', A);
    g.standalone('steal', set(1, 2));
    expect(ids(g.bases())).toEqual([null, A, null]);
    g.standalone('wild_pitch');
    expect(ids(g.bases())).toEqual([null, null, A]);
    g.atbat('walk', B);
    g.standalone('passed_ball'); // 三壘跑者得分、一壘跑者上二壘
    expect(ids(g.bases())).toEqual([null, B, null]);
    expect(runsByInning(g.events).get(1)).toBe(1);
    g.atbat('walk', C);
    g.standalone('balk');
    expect(ids(g.bases())).toEqual([null, C, B]);
    // 牽制預設最前面的三壘跑者出局，改成二壘跑者被牽制
    g.standalone('pickoff', (m) => set(2, null)(set(3, 3)(m)));
    expect(ids(g.bases())).toEqual([null, null, B]);
    expect(g.outs()).toBe(1);
    // 雙盜壘：預設只有最前面的三壘跑者，手動加上一壘跑者
    g.atbat('walk', D);
    g.standalone('steal', set(1, 2));
    expect(ids(g.bases())).toEqual([null, D, null]);
    expect(runsByInning(g.events).get(1)).toBe(2);
  });

  it('高飛犧牲打 vs 犧牲觸擊（同樣一、三壘有人、一出局）', () => {
    const fly = new Sim();
    fly.atbat('strikeout');
    fly.atbat('triple', C);
    fly.atbat('walk', A);
    const sf = fly.atbat('sacrifice_fly', B);
    expect(sf.rbi).toBe(1);
    expect(ids(fly.bases())).toEqual([A, null, null]);
    expect(fly.outs()).toBe(2);
    expect(runsByInning(fly.events).get(1)).toBe(1);

    const bunt = new Sim();
    bunt.atbat('strikeout');
    bunt.atbat('triple', C);
    bunt.atbat('walk', A);
    const sh = bunt.atbat('sacrifice', B);
    expect(sh.rbi).toBe(1);
    expect(ids(bunt.bases())).toEqual([null, A, null]);
    expect(bunt.outs()).toBe(2);
  });

  it('盜壘失敗、牽制造成第三出局就換局', () => {
    const g = new Sim();
    g.atbat('strikeout');
    g.atbat('strikeout');
    g.atbat('single', A);
    g.standalone('caught_stealing', set(1, null));
    expect(g.inning).toBe(2);
    expect(g.bases()).toEqual(EMPTY_BASES);
    // 換局後下一位打者仍是被打斷的那一棒
    expect(nextTurn(g.atbats, g.events, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slot).toBe(4);
  });

  it('刪除最後打席後壘包、出局數、局數回退', () => {
    const g = new Sim();
    g.atbat('single', A);
    g.atbat('double', B); // A 上三壘
    const before = { bases: ids(g.bases()), outs: g.outs() };
    g.atbat('sacrifice', C); // A 回來、B 上三壘、C 出局
    expect(g.outs()).toBe(1);
    g.deleteLastAtbat();
    expect(ids(g.bases())).toEqual(before.bases);
    expect(g.outs()).toBe(before.outs);
    expect(runsByInning(g.events).get(1)).toBeUndefined();

    // 刪除造成第三出局的打席：退回同一局
    g.atbat('strikeout');
    g.atbat('strikeout');
    g.atbat('strikeout');
    expect(g.inning).toBe(2);
    g.deleteLastAtbat();
    expect(g.inning).toBe(1);
    expect(g.outs()).toBe(2);
    expect(ids(g.bases())).toEqual([null, B, A]);
  });
});

describe('outsInInning', () => {
  it('舊打席（沒有事件）沿用結果的出局數', () => {
    const legacy = [
      { id: 'a1', inning: 1, ...resultToFields('strikeout') },
      { id: 'a2', inning: 1, ...resultToFields('double_play') },
      { id: 'a3', inning: 2, ...resultToFields('flyout') },
    ];
    expect(outsInInning(legacy, [], 1)).toBe(3);
    expect(outsInInning(legacy, [], 2)).toBe(1);
  });

  it('混合舊打席與有事件的打席不重複計算', () => {
    const atbats = [
      { id: 'a1', inning: 1, ...resultToFields('strikeout') }, // 舊
      { id: 'a2', inning: 1, ...resultToFields('fielders_choice') },
    ];
    const events = [ev(1, 'p2', B, 0, 1, { atbat_id: 'a2' }), ev(1, 'p2', A, 1, null, { atbat_id: 'a2' })];
    expect(outsInInning(atbats, events, 1)).toBe(2);
  });

  it('非打擊事件的出局也算', () => {
    expect(outsInInning([], [ev(3, 's1', A, 2, null, { event_type: 'pickoff' })], 3)).toBe(1);
  });
});

describe('nextTurn', () => {
  const orders = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('還沒開打從第一棒第一局開始', () => {
    expect(nextTurn([], [], orders)).toEqual({ slot: 1, inning: 1 });
  });

  it('第九棒之後輪回第一棒', () => {
    const atbats = [{ id: 'a', inning: 1, batting_order: 9, ...resultToFields('single') }];
    expect(nextTurn(atbats, [], orders)).toEqual({ slot: 1, inning: 1 });
  });

  it('舊打席滿 3 出局也會換局', () => {
    const atbats = [1, 2, 3].map((n) => ({ id: `a${n}`, inning: 1, batting_order: n, ...resultToFields('groundout') }));
    expect(nextTurn(atbats, [], orders)).toEqual({ slot: 4, inning: 2 });
  });
});

describe('isTracked（舊比賽相容）', () => {
  it('每個打席都有事件才由事件推算比分', () => {
    expect(isTracked([], [])).toBe(true);
    expect(isTracked([{ id: 'a1' }], [{ atbat_id: 'a1' }])).toBe(true);
    expect(isTracked([{ id: 'a1' }, { id: 'a2' }], [{ atbat_id: 'a1' }])).toBe(false);
    expect(isTracked([{ id: 'a1' }], [{ atbat_id: null }])).toBe(false);
  });
});

// ============================================
// 非打擊事件預設
// ============================================

describe('standaloneDefaults', () => {
  it('暴投／捕逸／投手犯規：所有跑者推進一個壘', () => {
    for (const t of ['wild_pitch', 'passed_ball', 'balk'] as const) {
      expect(dest(standaloneDefaults(t, bases(A, null, C)))).toEqual({ 1: 2, 3: 4 });
    }
  });

  it('暴投／捕逸／投手犯規：被擋住的跑者依序推進（滿壘全部推進、三壘得分）', () => {
    for (const t of ['wild_pitch', 'passed_ball', 'balk'] as const) {
      expect(dest(standaloneDefaults(t, bases(A, B, C)))).toEqual({ 1: 2, 2: 3, 3: 4 });
      expect(dest(standaloneDefaults(t, bases(A, null, null)))).toEqual({ 1: 2 });
    }
  });

  it('盜壘：最前面的跑者推進一個壘，其他留原壘', () => {
    expect(dest(standaloneDefaults('steal', bases(A, null, null)))).toEqual({ 1: 2 });
    expect(dest(standaloneDefaults('steal', bases(A, B, null)))).toEqual({ 1: 1, 2: 3 });
    expect(dest(standaloneDefaults('steal', bases(A, null, C)))).toEqual({ 1: 1, 3: 4 });
  });

  it('盜壘失敗／牽制出局：最前面的跑者出局', () => {
    for (const t of ['caught_stealing', 'pickoff'] as const) {
      const moves = standaloneDefaults(t, bases(A, B, null));
      expect(dest(moves)).toEqual({ 1: 1, 2: null });
      expect(movesOuts(moves)).toBe(1);
      expect(dest(standaloneDefaults(t, bases(A, null, null)))).toEqual({ 1: null });
    }
  });

  it('其他：預設留在原壘，由使用者選', () => {
    expect(dest(standaloneDefaults('other', bases(A, B, null)))).toEqual({ 1: 1, 2: 2 });
  });

  it('預設可以手動修改（例如盜壘失敗改成一壘跑者出局）', () => {
    const g = new Sim();
    g.atbat('single', A);
    g.atbat('single', B); // A 上二壘、B 一壘
    g.standalone('caught_stealing', (m) => set(1, null)(set(2, 2)(m)));
    expect(ids(g.bases())).toEqual([null, A, null]);
    expect(g.outs()).toBe(1);
  });

  it('所有預設都通過驗證', () => {
    const allBases = [
      bases(A, null, null), bases(null, B, null), bases(null, null, C),
      bases(A, B, null), bases(A, null, C), bases(null, B, C), bases(A, B, C),
    ];
    for (const b of allBases) for (const e of STANDALONE_EVENTS) {
      expect(validateMoves(standaloneDefaults(e.type, b)), `${e.type} ${ids(b)}`).toBeNull();
    }
  });

  it('壘上無人時沒有跑者', () => {
    expect(standaloneDefaults('wild_pitch', EMPTY_BASES)).toEqual([]);
  });
});

// ============================================
// 驗證
// ============================================

describe('validateMoves', () => {
  it('合法的移動', () => {
    expect(validateMoves([{ from: 0, to: 1 }, { from: 1, to: 2 }])).toBeNull();
    expect(validateMoves([{ from: 0, to: 4 }, { from: 1, to: 4 }, { from: 3, to: 4 }])).toBeNull();
    expect(validateMoves([{ from: 0, to: null }, { from: 1, to: null }, { from: 2, to: 2 }])).toBeNull();
    // 出局的前位跑者不擋後面的人
    expect(validateMoves([{ from: 1, to: 3 }, { from: 2, to: null }])).toBeNull();
  });

  it('兩個跑者同壘要拒絕', () => {
    expect(validateMoves([{ from: 0, to: 1 }, { from: 1, to: 1 }])).toMatch('1 壘');
    expect(validateMoves([{ from: 1, to: 3 }, { from: 3, to: 3 }])).toMatch('3 壘');
  });

  it('後位跑者超越前位跑者要拒絕', () => {
    expect(validateMoves([{ from: 1, to: 3 }, { from: 2, to: 2 }])).not.toBeNull();
    expect(validateMoves([{ from: 0, to: 4 }, { from: 3, to: 3 }])).toMatch('超越');
    expect(validateMoves([{ from: 1, to: 4 }, { from: 2, to: 3 }])).toMatch('超越');
  });

  it('往回跑要拒絕', () => {
    expect(validateMoves([{ from: 2, to: 1 }])).toMatch('往回');
    expect(validateMoves([{ from: 0, to: 0 }])).toMatch('往回');
  });
});

describe('parseRunnerInputs（API 輸入）', () => {
  it('沒送 runners 視為沒有跑壘', () => {
    expect(parseRunnerInputs(undefined, true)).toEqual([]);
    expect(parseRunnerInputs(null, false)).toEqual([]);
    expect(parseRunnerInputs([], false)).toEqual([]);
  });

  it('只保留有移動的跑者，打者事件必留', () => {
    expect(
      parseRunnerInputs(
        [
          { player_id: BATTER, from_base: 0, to_base: 1 },
          { player_id: A, from_base: 1, to_base: 2 },
          { player_id: C, from_base: 3, to_base: 3 },
        ],
        true
      )
    ).toEqual([
      { runner_player_id: BATTER, from_base: 0, to_base: 1 },
      { runner_player_id: A, from_base: 1, to_base: 2 },
    ]);
  });

  it('非 UUID 的 player_id 要拒絕，空值當作未知跑者', () => {
    expect(parseRunnerInputs([{ player_id: 'abc', from_base: 1, to_base: 2 }], false)).toBeNull();
    expect(parseRunnerInputs([{ player_id: 123, from_base: 1, to_base: 2 }], false)).toBeNull();
    expect(parseRunnerInputs([{ player_id: `${A}x`, from_base: 1, to_base: 2 }], false)).toBeNull();
    expect(parseRunnerInputs([{ player_id: '', from_base: 1, to_base: 2 }], false)).toEqual([
      { runner_player_id: null, from_base: 1, to_base: 2 },
    ]);
  });

  it('兩個跑者同壘、超越、往回跑要拒絕', () => {
    expect(parseRunnerInputs([{ from_base: 0, to_base: 1 }, { from_base: 1, to_base: 1 }], true)).toBeNull();
    expect(parseRunnerInputs([{ from_base: 1, to_base: 3 }, { from_base: 2, to_base: 2 }], false)).toBeNull();
    expect(parseRunnerInputs([{ from_base: 3, to_base: 2 }], false)).toBeNull();
  });

  it('同一個 from_base 出現兩次、超出範圍要拒絕', () => {
    expect(parseRunnerInputs([{ from_base: 1, to_base: 2 }, { from_base: 1, to_base: 3 }], false)).toBeNull();
    expect(parseRunnerInputs([{ from_base: 1, to_base: 5 }], false)).toBeNull();
    expect(parseRunnerInputs([{ from_base: 4, to_base: 4 }], false)).toBeNull();
    expect(parseRunnerInputs([{ from_base: 1.5, to_base: 2 }], false)).toBeNull();
    expect(parseRunnerInputs(new Array(5).fill({ from_base: 1, to_base: 2 }), false)).toBeNull();
    expect(parseRunnerInputs('x', false)).toBeNull();
    expect(parseRunnerInputs([null], false)).toBeNull();
  });

  it('非打擊事件不能有打者', () => {
    expect(parseRunnerInputs([{ from_base: 0, to_base: 1 }], false)).toBeNull();
  });

  it('打席有送跑壘就必須包含打者', () => {
    expect(parseRunnerInputs([{ player_id: A, from_base: 1, to_base: 2 }], true)).toBeNull();
  });

  it('不接受會被轉型的值（null / 空字串 / 布林 / 字串）', () => {
    expect(parseRunnerInputs([{ from_base: null, to_base: 1 }], true)).toBeNull();
    expect(parseRunnerInputs([{ from_base: '', to_base: 1 }], true)).toBeNull();
    expect(parseRunnerInputs([{ from_base: true, to_base: 2 }], false)).toBeNull();
    expect(parseRunnerInputs([{ from_base: '1', to_base: '2' }], false)).toBeNull();
    expect(parseRunnerInputs([{ from_base: 1 }], false)).toBeNull();
  });

  it('出局用 to_base null', () => {
    expect(parseRunnerInputs([{ from_base: 0, to_base: null }], true)).toEqual([
      { runner_player_id: null, from_base: 0, to_base: null },
    ]);
  });
});

describe('parseAllRunnerInputs / movedRunners', () => {
  it('保留停在原壘的跑者供伺服器驗證，寫入時只留有移動的', () => {
    const all = parseAllRunnerInputs(
      [
        { player_id: A, from_base: 1, to_base: 2 },
        { player_id: C, from_base: 3, to_base: 3 },
      ],
      false
    );
    expect(all).toEqual([
      { runner_player_id: A, from_base: 1, to_base: 2 },
      { runner_player_id: C, from_base: 3, to_base: 3 },
    ]);
    expect(movedRunners(all!)).toEqual([{ runner_player_id: A, from_base: 1, to_base: 2 }]);
  });
});

describe('checkRunnersOnBases（伺服器端確認跑者在壘上）', () => {
  const r = (playerId: string | null, from: number, to: number | null) => ({
    runner_player_id: playerId,
    from_base: from,
    to_base: to,
  });

  it('跑者都在壘上且 ID 相符時通過', () => {
    expect(checkRunnersOnBases([r(BATTER, 0, 1), r(A, 1, 2), r(C, 3, 4)], bases(A, null, C))).toBeNull();
    expect(checkRunnersOnBases([r(A, 1, 2)], bases(A, null, null))).toBeNull();
  });

  it('送來的 from_base 該壘沒有跑者要拒絕', () => {
    expect(checkRunnersOnBases([r(A, 2, 3)], bases(A, null, null))).toMatch('2 壘目前沒有跑者');
    expect(checkRunnersOnBases([r(BATTER, 0, 1), r(C, 3, 4)], EMPTY_BASES)).toMatch('3 壘');
    // 停在原壘的也要在壘上
    expect(checkRunnersOnBases([r(A, 1, 2), r(B, 2, 2)], bases(A, null, null))).toMatch('2 壘');
  });

  it('跑者 ID 不符要拒絕（含未知跑者對上已知跑者）', () => {
    expect(checkRunnersOnBases([r(B, 1, 2)], bases(A, null, null))).toMatch('跑者與紀錄不符');
    expect(checkRunnersOnBases([r(null, 1, 2)], bases(A, null, null))).toMatch('不符');
    // 已刪除球員（ID 為 null）的跑者送 null 才相符
    const deleted: Bases = [null, { playerId: null, player: null }, null, null];
    expect(checkRunnersOnBases([r(null, 1, 2)], deleted)).toBeNull();
  });

  it('沒送到的壘上跑者視為留在原壘，不能被超越或同壘兩人', () => {
    expect(checkRunnersOnBases([r(A, 1, 2)], bases(A, B, null))).toMatch('2 壘');
    expect(checkRunnersOnBases([r(A, 1, 4)], bases(A, null, C))).toMatch('超越');
    expect(checkRunnersOnBases([r(BATTER, 0, 1)], bases(A, null, null))).toMatch('1 壘');
  });

  it('第三出局後回本壘的分只警告不擋', () => {
    // 兩出局飛球接殺（打者出局＝第三出局），三壘跑者仍被手動改成得分
    expect(checkRunnersOnBases([r(BATTER, 0, null), r(C, 3, 4)], bases(null, null, C))).toBeNull();
  });

  it('用模擬比賽重播出的壘包驗證每一筆預設去向', () => {
    const g = new Sim();
    const check = (moves: RunnerMove[]) =>
      checkRunnersOnBases(
        parseAllRunnerInputs(moves.map((m) => ({ player_id: m.playerId, from_base: m.from, to_base: m.to })), moves.some((m) => m.from === 0))!,
        g.bases()
      );
    g.atbat('single', A);
    expect(check(defaultMoves('double', g.bases(), batter, g.outs()))).toBeNull();
    expect(check(standaloneDefaults('steal', g.bases()))).toBeNull();
    // 畫面過期：以為一壘有人，實際 A 已盜上二壘
    g.standalone('steal');
    expect(check([{ playerId: A, player: null, from: 1, to: 2 }])).toMatch('1 壘目前沒有跑者');
  });
});

describe('isUuid / isStandaloneType', () => {
  it('UUID 格式', () => {
    expect(isUuid(A)).toBe(true);
    expect(isUuid(A.toUpperCase())).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(`${A} `)).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it('只接受非打擊事件類型', () => {
    expect(isStandaloneType('steal')).toBe(true);
    expect(isStandaloneType('pickoff')).toBe(true);
    expect(isStandaloneType('batter')).toBe(false);
    expect(isStandaloneType('runner')).toBe(false);
    expect(isStandaloneType(undefined)).toBe(false);
  });
});

describe('batterEventPatch（修改打席結果）', () => {
  const batterOnly = [{ id: 'e1', from_base: 0, to_base: 1 }];

  it('結果沒變或沒有事件時不用動', () => {
    expect(batterEventPatch('single', 'single', batterOnly)).toEqual({ kind: 'none' });
    expect(batterEventPatch('single', 'double', [])).toEqual({ kind: 'none' });
  });

  it('只有打者事件時跟著新結果改', () => {
    expect(batterEventPatch('single', 'double', batterOnly)).toEqual({ kind: 'update', id: 'e1', to: 2 });
    expect(batterEventPatch('single', 'strikeout', batterOnly)).toEqual({ kind: 'update', id: 'e1', to: null });
    expect(batterEventPatch('single', 'walk', batterOnly)).toEqual({ kind: 'none' });
  });

  it('有其他跑者移動時只警告', () => {
    expect(
      batterEventPatch('single', 'double', [...batterOnly, { id: 'e2', from_base: 1, to_base: 2 }])
    ).toEqual({ kind: 'warn' });
  });
});
