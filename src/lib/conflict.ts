// 衝突檢查（前後端共用）：每筆打席/跑壘 play 送出時帶上「記錄當下畫面上的最後一筆動作」，
// 伺服器上的最後一筆已經不是它（例如離線期間另一支手機記了同一位打者）就回 409，
// 不然兩支手機記的同一個打席都會寫進去，打席與出局數重複計算。
//
// 只比對跑者位置不夠：壘上沒人或跑者沒動時，兩筆紀錄的跑者檢查都會通過。

import { UndoRequest, sameTarget } from '@/lib/undo';

// none = 記錄時這場比賽還沒有任何紀錄；sub = 前一筆是換人；
// client = 前一筆是同一支手機上還在排隊的紀錄，以它的 client_id（= play_id）找伺服器上的紀錄
export type ExpectedLast =
  | { kind: 'none' }
  | { kind: 'atbat'; id: string }
  | { kind: 'play'; play_id: string }
  | { kind: 'sub'; id: string }
  | { kind: 'client'; client_id: string };

// undefined = 沒帶（舊版前端），不檢查；格式錯誤回傳 false
export function parseExpectedLast(value: unknown, isId: (v: unknown) => v is string): ExpectedLast | undefined | false {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'none') return { kind: 'none' };
  if (v.kind === 'atbat' && isId(v.id)) return { kind: 'atbat', id: v.id };
  if (v.kind === 'play' && isId(v.play_id)) return { kind: 'play', play_id: v.play_id };
  if (v.kind === 'sub' && isId(v.id)) return { kind: 'sub', id: v.id };
  if (v.kind === 'client' && isId(v.client_id)) return { kind: 'client', client_id: v.client_id };
  return false;
}

export const CONFLICT_ERROR =
  '這場比賽已經有更新的紀錄（可能是其他裝置記錄的），這筆是依舊的畫面記的，沒有寫入；請依最新畫面重新記錄';

// latest = 伺服器上目前最後一筆；resolveClient 把 client_id 換成伺服器上的紀錄（找不到回 null）
export async function checkExpected(
  expected: ExpectedLast,
  latest: UndoRequest | null,
  resolveClient: (clientId: string) => Promise<UndoRequest | null>
): Promise<{ ok: true } | { ok: false; error: string }> {
  let want: UndoRequest | null;
  if (expected.kind === 'none') want = null;
  else if (expected.kind === 'client') {
    want = await resolveClient(expected.client_id);
    // 前一筆排隊中的紀錄不在伺服器上（被捨棄或撤銷）：這筆的壘包/出局是以它為前提，不能寫入
    if (!want) return { ok: false, error: CONFLICT_ERROR };
  } else want = expected;
  return sameTarget(latest, want) ? { ok: true } : { ok: false, error: CONFLICT_ERROR };
}
