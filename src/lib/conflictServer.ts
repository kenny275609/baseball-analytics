// 伺服器端：以資料庫為準找出一場比賽的最後一筆動作，並檢查送來的紀錄是不是接在它後面
import type { SupabaseClient } from '@supabase/supabase-js';
import { ExpectedLast, checkExpected } from '@/lib/conflict';
import { isMissingTable } from '@/lib/score';
import { UndoRequest, latestAction } from '@/lib/undo';

// 最後一個打席 vs 最後一個非打擊跑壘
export async function findLatest(supabase: SupabaseClient, gameId: string) {
  const [atbatRes, playRes] = await Promise.all([
    supabase
      .from('atbats')
      .select('id, created_at')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1),
    supabase
      .from('runner_events')
      .select('id, atbat_id, play_id, created_at')
      .eq('game_id', gameId)
      .is('atbat_id', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1),
  ]);
  if (atbatRes.error) throw atbatRes.error;
  if (playRes.error && !isMissingTable(playRes.error)) throw playRes.error;
  return latestAction(atbatRes.data ?? [], playRes.error ? [] : playRes.data ?? []);
}

// client_id（= play_id）寫入的是打席還是非打擊跑壘
async function resolveClientId(supabase: SupabaseClient, gameId: string, clientId: string): Promise<UndoRequest | null> {
  const { data, error } = await supabase
    .from('runner_events')
    .select('atbat_id')
    .eq('game_id', gameId)
    .eq('play_id', clientId)
    .limit(1);
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  const first = data?.[0];
  if (!first) return null;
  return first.atbat_id ? { kind: 'atbat', id: first.atbat_id as string } : { kind: 'play', play_id: clientId };
}

// 沒有交易可用：兩支手機的請求幾乎同時到時仍可能都通過，但離線重連後才送出的舊紀錄一定會被擋下
export async function checkExpectedInDb(supabase: SupabaseClient, gameId: string, expected: ExpectedLast) {
  const latest = await findLatest(supabase, gameId);
  return checkExpected(expected, latest, (clientId) => resolveClientId(supabase, gameId, clientId));
}
