// 防守紀錄：對手進攻時每個 play 的結果與守備路徑（前後端共用）
//
// 守備路徑用位置編號記錄經手的野手，依傳球順序：6-4-3 = 游擊 → 二壘 → 一壘。
// 慢壘有 10 位守備，10 是自由手。
// 刺殺 / 助殺依路徑推算：最後 outs 個位置各記一次刺殺，最後一個以外的位置各記一次助殺（同一個 play 每人最多一次）
//   4-3 滾地：4 助殺、3 刺殺；6-4-3 雙殺：6、4 助殺，4、3 刺殺；F8：8 刺殺；K：捕手刺殺

export type DefenseResult =
  | 'strikeout'
  | 'groundout'
  | 'flyout'
  | 'double_play'
  | 'triple_play'
  | 'fielders_choice'
  | 'sacrifice'
  | 'sacrifice_fly'
  | 'single'
  | 'double'
  | 'triple'
  | 'homerun'
  | 'walk'
  | 'hit_by_pitch'
  | 'error'
  | 'other_out';

export interface DefenseResultOption {
  code: DefenseResult;
  label: string;
  short: string;
  outs: number;
  // 需不需要點守備路徑：required 一定要、optional 可點可不點（例如安打記打到哪個方向）、none 不用
  path: 'required' | 'optional' | 'none';
  group: 'out' | 'safe';
}

export const DEFENSE_RESULTS: DefenseResultOption[] = [
  { code: 'strikeout', label: '三振', short: 'K', outs: 1, path: 'optional', group: 'out' },
  { code: 'groundout', label: '滾地出局', short: 'GO', outs: 1, path: 'required', group: 'out' },
  { code: 'flyout', label: '飛球接殺', short: 'FO', outs: 1, path: 'required', group: 'out' },
  { code: 'double_play', label: '雙殺', short: 'DP', outs: 2, path: 'required', group: 'out' },
  { code: 'triple_play', label: '三殺', short: 'TP', outs: 3, path: 'required', group: 'out' },
  { code: 'fielders_choice', label: '野手選擇', short: 'FC', outs: 1, path: 'required', group: 'out' },
  { code: 'sacrifice', label: '犧牲觸擊', short: 'SH', outs: 1, path: 'required', group: 'out' },
  { code: 'sacrifice_fly', label: '高飛犧牲打', short: 'SF', outs: 1, path: 'required', group: 'out' },
  { code: 'other_out', label: '其他出局', short: 'OUT', outs: 1, path: 'required', group: 'out' },
  { code: 'single', label: '一壘安打', short: '1B', outs: 0, path: 'optional', group: 'safe' },
  { code: 'double', label: '二壘安打', short: '2B', outs: 0, path: 'optional', group: 'safe' },
  { code: 'triple', label: '三壘安打', short: '3B', outs: 0, path: 'optional', group: 'safe' },
  { code: 'homerun', label: '全壘打', short: 'HR', outs: 0, path: 'optional', group: 'safe' },
  { code: 'walk', label: '保送', short: 'BB', outs: 0, path: 'none', group: 'safe' },
  { code: 'hit_by_pitch', label: '觸身球', short: 'HBP', outs: 0, path: 'none', group: 'safe' },
  { code: 'error', label: '失誤上壘', short: 'E', outs: 0, path: 'required', group: 'safe' },
];

const BY_CODE = new Map(DEFENSE_RESULTS.map((o) => [o.code, o]));

export function getDefenseResult(code: string | null | undefined): DefenseResultOption | null {
  return code ? BY_CODE.get(code as DefenseResult) ?? null : null;
}

export const POSITIONS = [
  { pos: 1, short: '投', label: '投手' },
  { pos: 2, short: '捕', label: '捕手' },
  { pos: 3, short: '一', label: '一壘手' },
  { pos: 4, short: '二', label: '二壘手' },
  { pos: 5, short: '三', label: '三壘手' },
  { pos: 6, short: '游', label: '游擊手' },
  { pos: 7, short: '左', label: '左外野手' },
  { pos: 8, short: '中', label: '中外野手' },
  { pos: 9, short: '右', label: '右外野手' },
  { pos: 10, short: '自', label: '自由手' },
] as const;

export const MAX_POSITION = 10;
export const MAX_PATH = 8;

export function positionLabel(pos: number): string {
  return POSITIONS.find((p) => p.pos === pos)?.label ?? `${pos}`;
}

// 三振沒有點路徑時由捕手接殺；不死三振傳殺記 2-3
export function effectivePath(result: DefenseResult, path: number[]): number[] {
  if (result === 'strikeout' && path.length === 0) return [2];
  return path;
}

// 記分簿寫法：K、F8、6-3、3U、6-4-3 DP、E6、1B(7)
export function defenseNotation(result: DefenseResult, path: number[]): string {
  const p = path.join('-');
  switch (result) {
    case 'strikeout':
      // 不死三振傳殺：K 2-3
      return path.length > 1 ? `K ${p}` : 'K';
    case 'flyout':
      return path.length === 1 ? `F${path[0]}` : p;
    case 'groundout':
      return path.length === 1 ? `${path[0]}U` : p;
    case 'double_play':
      return `${path.length === 1 ? `${path[0]}U` : p} DP`;
    case 'triple_play':
      return `${path.length === 1 ? `${path[0]}U` : p} TP`;
    case 'sacrifice':
      return `SH ${p}`;
    case 'sacrifice_fly':
      return `SF${p}`;
    case 'fielders_choice':
      return `FC ${p}`;
    case 'error':
      return `E${path[path.length - 1]}`;
    case 'other_out':
      return p;
    default: {
      const short = getDefenseResult(result)?.short ?? '';
      return path.length > 0 ? `${short}(${p})` : short;
    }
  }
}

export interface DefenseInput {
  game_id: string;
  client_id: string | null;
  inning: number;
  result: DefenseResult;
  path: number[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// 檢查守備路徑；沒問題回傳 null
export function pathError(result: DefenseResult, path: number[]): string | null {
  const opt = getDefenseResult(result);
  if (!opt) return '請選擇結果';
  if (path.length > MAX_PATH) return `守備路徑最多 ${MAX_PATH} 個位置`;
  if (path.some((p) => !Number.isInteger(p) || p < 1 || p > MAX_POSITION)) return '守備位置錯誤';
  if (opt.path === 'none' && path.length > 0) return `${opt.label}不用記守備路徑`;
  if (opt.path === 'required' && path.length === 0) {
    return result === 'error' ? '請點選失誤的守備位置' : '請點選守備路徑（接到球、傳球的位置）';
  }
  if ((result === 'flyout' || result === 'sacrifice_fly') && path.length > 1) return '飛球接殺只記接球的位置';
  if (result === 'strikeout' && path.length > 2) return '三振最多記兩個位置（例如漏接後 2-3）';
  if (result !== 'strikeout' && (opt.path === 'optional' || result === 'error') && path.length > 1) return '這個結果只記一個位置';
  return null;
}

export function parseDefenseInput(body: unknown): { value: DefenseInput } | { error: string } {
  if (!body || typeof body !== 'object') return { error: '資料錯誤' };
  const b = body as Record<string, unknown>;
  if (!isUuid(b.game_id)) return { error: '缺少比賽' };
  if (b.client_id !== undefined && b.client_id !== null && !isUuid(b.client_id)) return { error: 'client_id 格式錯誤' };
  const inning = b.inning;
  if (typeof inning !== 'number' || !Number.isInteger(inning) || inning < 1 || inning > 30) return { error: '局數錯誤' };
  const opt = getDefenseResult(typeof b.result === 'string' ? b.result : null);
  if (!opt) return { error: '請選擇結果' };
  if (!Array.isArray(b.path)) return { error: '守備路徑錯誤' };
  const path = b.path as number[];
  const err = pathError(opt.code, path);
  if (err) return { error: err };
  return {
    value: {
      game_id: b.game_id,
      client_id: isUuid(b.client_id) ? b.client_id : null,
      inning,
      result: opt.code,
      // 三振沒點路徑時存成 [2]，記錄當下的捕手才會跟著存進 path_players
      path: effectivePath(opt.code, path),
    },
  };
}

export interface DefensePlay {
  id: string;
  inning: number;
  result: DefenseResult;
  path: number[];
  // 記錄當下各路徑位置上的球員（和 path 對齊；該位置沒排人時為 null）
  path_players: (string | null)[];
  created_at: string;
}

export interface FieldingCredit {
  // 位置、球員各得到的刺殺 / 助殺 / 失誤
  putouts: number[];
  assists: number[];
  error: number | null;
}

// 只看路徑推算這個 play 的刺殺 / 助殺 / 失誤（以路徑索引表示）
export function fieldingCredits(result: DefenseResult, path: number[]): FieldingCredit {
  const p = effectivePath(result, path);
  if (result === 'error') return { putouts: [], assists: [], error: p.length - 1 };
  const outs = getDefenseResult(result)?.outs ?? 0;
  if (outs === 0 || p.length === 0) return { putouts: [], assists: [], error: null };
  const putouts: number[] = [];
  for (let i = Math.max(0, p.length - outs); i < p.length; i++) putouts.push(i);
  // 路徑比出局數短（例如 3U 雙殺）：最後一位記滿刺殺
  while (putouts.length < outs) putouts.push(p.length - 1);
  // 三振不算捕手助殺；夾殺等同一位野手傳兩次以上的路徑（6-5-6-5）每人只記一次助殺
  const assists =
    result === 'strikeout' && p.length === 1
      ? []
      : p.slice(0, -1).flatMap((pos, i) => (p.indexOf(pos) === i ? [i] : []));
  return { putouts, assists, error: null };
}

export interface FieldingLine {
  key: string; // 球員 id，沒排人時用 pos:N
  playerId: string | null;
  positions: number[];
  po: number;
  a: number;
  e: number;
}

export function fieldingStats(plays: DefensePlay[]): FieldingLine[] {
  const lines = new Map<string, FieldingLine>();
  const line = (idx: number, play: DefensePlay, path: number[]) => {
    const playerId = play.path_players[idx] ?? null;
    const pos = path[idx];
    const key = playerId ?? `pos:${pos}`;
    let l = lines.get(key);
    if (!l) {
      l = { key, playerId, positions: [], po: 0, a: 0, e: 0 };
      lines.set(key, l);
    }
    if (!l.positions.includes(pos)) l.positions.push(pos);
    return l;
  };
  for (const play of plays) {
    const path = effectivePath(play.result, play.path);
    const credit = fieldingCredits(play.result, play.path);
    for (const i of credit.putouts) line(i, play, path).po++;
    for (const i of credit.assists) line(i, play, path).a++;
    if (credit.error !== null) line(credit.error, play, path).e++;
  }
  return [...lines.values()].sort((x, y) => Math.min(...x.positions) - Math.min(...y.positions));
}

// 依局數整理：每局的 play 與每個出局是第幾個
export interface InningPlay {
  play: DefensePlay;
  outsAfter: number;
  outNumbers: number[]; // 這個 play 造成的是本局第幾個出局
}

export function playsByInning(plays: DefensePlay[]): Map<number, InningPlay[]> {
  const out = new Map<number, InningPlay[]>();
  const sorted = [...plays].sort((a, b) => a.inning - b.inning || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const play of sorted) {
    const list = out.get(play.inning) ?? [];
    const before = list.length ? list[list.length - 1].outsAfter : 0;
    const outs = getDefenseResult(play.result)?.outs ?? 0;
    const outNumbers = Array.from({ length: outs }, (_, i) => before + i + 1);
    list.push({ play, outsAfter: before + outs, outNumbers });
    out.set(play.inning, list);
  }
  return out;
}

// 下一個要記的局：最後一局還沒滿 3 出局就停在那局，滿了就往下一局
export function currentDefenseInning(plays: DefensePlay[]): number {
  if (plays.length === 0) return 1;
  const by = playsByInning(plays);
  const last = Math.max(...by.keys());
  const list = by.get(last)!;
  return list[list.length - 1].outsAfter >= 3 ? Math.min(30, last + 1) : last;
}
