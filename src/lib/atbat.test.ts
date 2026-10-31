import { describe, expect, it } from 'vitest';
import {
  QUICK_RESULTS,
  RESULT_OPTIONS,
  ResultCode,
  computeStats,
  countOuts,
  countPlateAppearances,
  fieldsToResult,
  getResultOption,
  parseAtbatInput,
  resultToFields,
} from '@/lib/atbat';

describe('resultToFields / fieldsToResult', () => {
  it('每個結果都能來回轉換', () => {
    for (const o of RESULT_OPTIONS) {
      expect(fieldsToResult(resultToFields(o.code))).toBe(o.code);
    }
  });
});

describe('犧牲觸擊 / 高飛犧牲打', () => {
  it('舊資料的 sacrifice 仍可讀取，顯示為犧牲觸擊；高飛犧牲打另存 sacrifice_fly', () => {
    const legacy = { contacted: true, no_contact: null, result: 'sacrifice', out_type: null };
    expect(fieldsToResult(legacy)).toBe('sacrifice');
    expect(getResultOption('sacrifice')?.label).toBe('犧牲觸擊');
    expect(resultToFields('sacrifice_fly')).toEqual({ contacted: true, no_contact: null, result: 'sacrifice_fly', out_type: null });
    expect(getResultOption('sacrifice_fly')).toMatchObject({ label: '高飛犧牲打', outs: 1 });
    expect(QUICK_RESULTS.map((o) => o.code)).toEqual(expect.arrayContaining(['sacrifice', 'sacrifice_fly']));
    expect(parseAtbatInput({ result: 'sacrifice_fly', rbi: 1 }).row).toMatchObject({ result: 'sacrifice_fly', rbi: 1 });
  });

  it('兩者都不算打數；高飛犧牲打算進上壘率分母、犧牲觸擊不算', () => {
    const rows = (codes: ResultCode[]) => codes.map((c) => ({ ...resultToFields(c), rbi: 0 }));
    const sh = computeStats(rows(['single', 'strikeout', 'sacrifice']));
    expect(sh).toMatchObject({ pa: 3, ab: 2, sac: 1, sf: 0 });
    expect(sh.obp).toBeCloseTo(1 / 2);

    const sf = computeStats(rows(['single', 'strikeout', 'sacrifice_fly']));
    expect(sf).toMatchObject({ pa: 3, ab: 2, sac: 1, sf: 1 });
    expect(sf.avg).toBeCloseTo(1 / 2);
    expect(sf.obp).toBeCloseTo(1 / 3);
  });
});

describe('countPlateAppearances', () => {
  it('只算有打擊結果的打席', () => {
    const rows = (['single', 'walk', 'strikeout', 'sacrifice_fly', 'other'] as ResultCode[]).map(resultToFields);
    expect(countPlateAppearances(rows)).toBe(5);
    // 沒有結果的殘缺資料不算
    expect(countPlateAppearances([...rows, { contacted: true, no_contact: null, result: null, out_type: null }])).toBe(5);
    expect(countPlateAppearances([])).toBe(0);
  });
});

describe('countOuts', () => {
  it('依結果計算出局數', () => {
    const outs = (codes: Parameters<typeof resultToFields>[0][]) => countOuts(codes.map(resultToFields));
    expect(outs(['single', 'walk', 'error'])).toBe(0);
    expect(outs(['strikeout', 'fielders_choice', 'sacrifice'])).toBe(3);
    expect(outs(['double_play'])).toBe(2);
    expect(outs(['triple_play'])).toBe(3);
  });
});

describe('parseAtbatInput', () => {
  it('沒有合法結果要拒絕', () => {
    expect(parseAtbatInput({}).error).toBeTruthy();
    expect(parseAtbatInput({ result: 'foo' }).error).toBeTruthy();
  });

  it('打點限制 0-4，局數 1-30，超出範圍當作空值', () => {
    expect(parseAtbatInput({ result: 'single', rbi: 2, inning: 3 }).row).toMatchObject({ rbi: 2, inning: 3 });
    expect(parseAtbatInput({ result: 'single', rbi: 5, inning: 0 }).row).toMatchObject({ rbi: 0, inning: null });
    expect(parseAtbatInput({ result: 'single', rbi: -1, inning: 31 }).row).toMatchObject({ rbi: 0, inning: null });
  });

  it('沒有擊球的結果不存擊球品質與落點', () => {
    expect(parseAtbatInput({ result: 'walk', quality: 'hard', hit_x: 50, hit_y: 50 }).row).toMatchObject({
      quality: null,
      hit_x: null,
      hit_y: null,
    });
    expect(parseAtbatInput({ result: 'double', quality: 'hard', hit_x: 50, hit_y: 20 }).row).toMatchObject({
      quality: 'hard',
      hit_x: 50,
      hit_y: 20,
    });
  });
});
