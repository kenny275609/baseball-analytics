import { describe, expect, it } from 'vitest';
import { isMissingTable, scoreUpdates } from '@/lib/score';

describe('scoreUpdates', () => {
  it('還沒開打：比分清空', () => {
    expect(scoreUpdates([], [], [])).toEqual({ our_score: null, opp_score: null });
  });

  it('有跑壘資料的比賽：我方比分 = 回本壘人數，對手 = 每局得分總和', () => {
    const atbats = [{ id: 'a1' }, { id: 'a2' }];
    const events = [
      { atbat_id: 'a1', to_base: 1 },
      { atbat_id: 'a2', to_base: 4 },
      { atbat_id: 'a2', to_base: 4 },
      { atbat_id: null, to_base: 4 }, // 暴投得分
      { atbat_id: null, to_base: null },
    ];
    expect(scoreUpdates(atbats, events, [{ opp_runs: 2 }, { opp_runs: 3 }])).toEqual({
      our_score: 3,
      opp_score: 5,
    });
  });

  it('有跑壘資料、還沒填對手得分：對手 0 分', () => {
    expect(scoreUpdates([{ id: 'a1' }], [{ atbat_id: 'a1', to_base: null }], [])).toEqual({
      our_score: 0,
      opp_score: 0,
    });
  });

  it('只有對手每局得分（我方還沒打）', () => {
    expect(scoreUpdates([], [], [{ opp_runs: 1 }])).toEqual({ our_score: 0, opp_score: 1 });
  });

  it('舊比賽（打席沒有跑壘事件）：我方比分維持手動，不覆蓋', () => {
    expect(scoreUpdates([{ id: 'a1' }], [], [])).toEqual({});
    expect(scoreUpdates([{ id: 'a1' }], [], [{ opp_runs: 4 }])).toEqual({ opp_score: 4 });
  });

  it('舊比賽重新開啟後繼續記錄：混有舊打席時不改我方比分', () => {
    const atbats = [{ id: 'old' }, { id: 'new' }];
    const events = [{ atbat_id: 'new', to_base: 4 }];
    expect(scoreUpdates(atbats, events, [])).toEqual({});
  });

  it('刪掉所有打席後回到沒有比分', () => {
    expect(scoreUpdates([], [], [])).toEqual({ our_score: null, opp_score: null });
  });

  it('opp_runs 為 null 當 0', () => {
    expect(scoreUpdates([], [], [{ opp_runs: null }, { opp_runs: 2 }])).toEqual({ our_score: 0, opp_score: 2 });
  });
});

describe('isMissingTable', () => {
  it('辨識資料表不存在的錯誤碼', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true);
    expect(isMissingTable({ code: 'PGRST205' })).toBe(true);
    expect(isMissingTable({ code: '23505' })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});
