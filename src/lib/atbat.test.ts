import { describe, expect, it } from 'vitest';
import { RESULT_OPTIONS, countOuts, fieldsToResult, parseAtbatInput, resultToFields } from '@/lib/atbat';

describe('resultToFields / fieldsToResult', () => {
  it('每個結果都能來回轉換', () => {
    for (const o of RESULT_OPTIONS) {
      expect(fieldsToResult(resultToFields(o.code))).toBe(o.code);
    }
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
