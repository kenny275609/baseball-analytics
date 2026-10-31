// 伺服器端：從資料庫重播該場該局的跑壘事件，驗證送來的跑者真的在壘上
import type { SupabaseClient } from '@supabase/supabase-js';
import { Bases, RunnerEventInput, checkRunnersOnBases, computeBases } from '@/lib/baserunning';
import { isMissingTable } from '@/lib/score';

// ok = 通過；invalid = 跑者不在壘上（回 400）；missing = 資料表不存在；failed = 讀取失敗
export type BaseCheck =
  | { kind: 'ok' }
  | { kind: 'invalid'; error: string }
  | { kind: 'missing' }
  | { kind: 'failed'; error: unknown };

export async function checkRunnersInDb(
  supabase: SupabaseClient,
  gameId: string,
  inning: number,
  runners: RunnerEventInput[]
): Promise<BaseCheck> {
  const bases = await basesInDb(supabase, gameId, inning);
  if (bases.kind !== 'ok') return bases;
  const invalid = checkRunnersOnBases(runners, bases.bases);
  return invalid ? { kind: 'invalid', error: invalid } : { kind: 'ok' };
}

// 資料庫裡該局的壘包（含代跑換上的跑者）
export async function basesInDb(
  supabase: SupabaseClient,
  gameId: string,
  inning: number
): Promise<{ kind: 'ok'; bases: Bases; outs: number } | { kind: 'missing' } | { kind: 'failed'; error: unknown }> {
  const [eventsRes, subsRes] = await Promise.all([
    supabase
      .from('runner_events')
      .select('play_id, inning, runner_player_id, from_base, to_base, created_at')
      .eq('game_id', gameId)
      .eq('inning', inning)
      // 和比賽頁（games/get）同樣依 created_at 重播；時間相同時用 id 讓順序固定
      .order('created_at')
      .order('id'),
    supabase
      .from('game_substitutions')
      .select('inning, base, out_player_id, in_player_id, created_at')
      .eq('game_id', gameId)
      .eq('inning', inning)
      .eq('sub_type', 'pinch_runner')
      .order('created_at')
      .order('id'),
  ]);
  const { data, error } = eventsRes;
  if (error) return isMissingTable(error) ? { kind: 'missing' } : { kind: 'failed', error };
  // 換人的 migration 還沒執行：沒有代跑紀錄
  if (subsRes.error && !isMissingTable(subsRes.error)) return { kind: 'failed', error: subsRes.error };
  const events = data ?? [];
  return {
    kind: 'ok',
    bases: computeBases(events, inning, subsRes.error ? [] : subsRes.data ?? []),
    // 跑壘事件記錄的出局數（to_base 為 null）；三出局後壘上剩下的是殘壘
    outs: events.filter((e) => e.to_base === null).length,
  };
}
