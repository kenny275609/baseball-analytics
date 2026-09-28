// 打席結果定義與統計計算（前後端共用）
//
// 資料庫沿用舊欄位：contacted / no_contact / result / out_type，
// 這裡把它們收斂成單一個 ResultCode，UI 只需要處理一個值。

export type ResultCode =
  | 'single'
  | 'double'
  | 'triple'
  | 'homerun'
  | 'walk'
  | 'hit_by_pitch'
  | 'strikeout'
  | 'groundout'
  | 'flyout'
  | 'out'
  | 'double_play'
  | 'triple_play'
  | 'fielders_choice'
  | 'error'
  | 'sacrifice'
  | 'other';

export type ResultGroup = 'hit' | 'onbase' | 'out' | 'other';

export interface ResultOption {
  code: ResultCode;
  label: string;
  short: string;
  group: ResultGroup;
  contacted: boolean;
  outs: number;
}

export const RESULT_OPTIONS: ResultOption[] = [
  { code: 'single', label: '一壘安打', short: '1B', group: 'hit', contacted: true, outs: 0 },
  { code: 'double', label: '二壘安打', short: '2B', group: 'hit', contacted: true, outs: 0 },
  { code: 'triple', label: '三壘安打', short: '3B', group: 'hit', contacted: true, outs: 0 },
  { code: 'homerun', label: '全壘打', short: 'HR', group: 'hit', contacted: true, outs: 0 },
  { code: 'walk', label: '保送', short: 'BB', group: 'onbase', contacted: false, outs: 0 },
  { code: 'hit_by_pitch', label: '觸身球', short: 'HBP', group: 'onbase', contacted: false, outs: 0 },
  { code: 'error', label: '失誤上壘', short: 'E', group: 'onbase', contacted: true, outs: 0 },
  { code: 'fielders_choice', label: '野手選擇', short: 'FC', group: 'onbase', contacted: true, outs: 1 },
  { code: 'strikeout', label: '三振', short: 'K', group: 'out', contacted: false, outs: 1 },
  { code: 'groundout', label: '滾地出局', short: 'GO', group: 'out', contacted: true, outs: 1 },
  { code: 'flyout', label: '飛球接殺', short: 'FO', group: 'out', contacted: true, outs: 1 },
  { code: 'double_play', label: '雙殺', short: 'DP', group: 'out', contacted: true, outs: 2 },
  { code: 'triple_play', label: '三殺', short: 'TP', group: 'out', contacted: true, outs: 3 },
  { code: 'sacrifice', label: '犧牲打', short: 'SAC', group: 'other', contacted: true, outs: 1 },
  { code: 'out', label: '出局（未分類）', short: 'OUT', group: 'out', contacted: true, outs: 1 },
  { code: 'other', label: '其他', short: '—', group: 'other', contacted: false, outs: 0 },
];

// 比賽中快速記錄時顯示的按鈕（不含舊資料才會出現的「出局（未分類）」）
export const QUICK_RESULTS = RESULT_OPTIONS.filter((o) => o.code !== 'out');

const OPTION_BY_CODE = new Map(RESULT_OPTIONS.map((o) => [o.code, o]));

export function getResultOption(code: ResultCode | null): ResultOption | null {
  return code ? OPTION_BY_CODE.get(code) ?? null : null;
}

export function isResultCode(value: unknown): value is ResultCode {
  return typeof value === 'string' && OPTION_BY_CODE.has(value as ResultCode);
}

const NO_CONTACT_CODES: ResultCode[] = ['strikeout', 'walk', 'hit_by_pitch', 'other'];
const OUT_TYPE_CODES: ResultCode[] = ['groundout', 'flyout', 'double_play', 'triple_play'];

export interface AtbatResultFields {
  contacted: boolean;
  no_contact: string | null;
  result: string | null;
  out_type: string | null;
}

export function resultToFields(code: ResultCode): AtbatResultFields {
  if (NO_CONTACT_CODES.includes(code)) {
    return { contacted: false, no_contact: code, result: null, out_type: null };
  }
  if (OUT_TYPE_CODES.includes(code)) {
    return { contacted: true, no_contact: null, result: 'out', out_type: code };
  }
  return { contacted: true, no_contact: null, result: code, out_type: null };
}

export function fieldsToResult(a: AtbatResultFields): ResultCode | null {
  if (!a.contacted) {
    return isResultCode(a.no_contact) ? a.no_contact : 'other';
  }
  if (a.result === 'out') {
    return isResultCode(a.out_type) ? a.out_type : 'out';
  }
  return isResultCode(a.result) ? a.result : null;
}

// ============================================
// 統計
// ============================================

export interface BattingStats {
  pa: number;
  ab: number;
  h: number;
  b1: number;
  b2: number;
  b3: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sac: number;
  rbi: number;
  tb: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
}

// 打數 (AB) = 打席 − 保送 − 觸身 − 犧牲打 − 其他
// 三振、失誤、野選都算打數。
// 系統沒有區分犧牲觸擊/犧牲飛球，因此上壘率分母不含犧牲打。
export function computeStats(
  atbats: (AtbatResultFields & { rbi: number | null })[]
): BattingStats {
  const count: Partial<Record<ResultCode, number>> = {};
  let rbi = 0;
  for (const a of atbats) {
    const code = fieldsToResult(a);
    if (code) count[code] = (count[code] ?? 0) + 1;
    rbi += a.rbi ?? 0;
  }
  const n = (c: ResultCode) => count[c] ?? 0;

  const pa = atbats.length;
  const b1 = n('single');
  const b2 = n('double');
  const b3 = n('triple');
  const hr = n('homerun');
  const bb = n('walk');
  const hbp = n('hit_by_pitch');
  const sac = n('sacrifice');
  const h = b1 + b2 + b3 + hr;
  const ab = pa - bb - hbp - sac - n('other');
  const tb = b1 + 2 * b2 + 3 * b3 + 4 * hr;
  const obpDenom = ab + bb + hbp;

  const avg = ab > 0 ? h / ab : 0;
  const obp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : 0;
  const slg = ab > 0 ? tb / ab : 0;

  return {
    pa, ab, h, b1, b2, b3, hr, bb, hbp,
    so: n('strikeout'),
    sac, rbi, tb, avg, obp, slg,
    ops: obp + slg,
  };
}

// .333 / 1.000 這種棒球慣用格式
export function formatRate(value: number): string {
  const s = value.toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}

export function countOuts(atbats: AtbatResultFields[]): number {
  return atbats.reduce((sum, a) => sum + (getResultOption(fieldsToResult(a))?.outs ?? 0), 0);
}

export const QUALITY_OPTIONS = [
  { value: 'hard', label: '強勁' },
  { value: 'medium', label: '中等' },
  { value: 'soft', label: '軟弱' },
] as const;

export function qualityLabel(value: string | null): string {
  return QUALITY_OPTIONS.find((q) => q.value === value)?.label ?? '-';
}

// ============================================
// API 輸入驗證：只允許白名單欄位寫入資料庫
// ============================================

function numberOrNull(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function parseAtbatInput(
  body: Record<string, unknown>
): { row: Record<string, unknown>; error?: never } | { row?: never; error: string } {
  if (!isResultCode(body.result)) {
    return { error: '請選擇打席結果' };
  }
  const option = getResultOption(body.result)!;
  const quality = QUALITY_OPTIONS.some((q) => q.value === body.quality) ? body.quality : null;
  const hitX = option.contacted ? numberOrNull(body.hit_x, 0, 100) : null;
  const hitY = option.contacted ? numberOrNull(body.hit_y, 0, 100) : null;

  return {
    row: {
      ...resultToFields(body.result),
      quality: option.contacted ? quality : null,
      rbi: numberOrNull(body.rbi, 0, 4) ?? 0,
      hit_x: hitX !== null && hitY !== null ? hitX : null,
      hit_y: hitX !== null && hitY !== null ? hitY : null,
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
      inning: numberOrNull(body.inning, 1, 30),
      batting_order: numberOrNull(body.batting_order, 1, 20),
    },
  };
}
