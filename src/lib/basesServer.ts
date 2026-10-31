// 伺服器端：從資料庫重播該場該局的跑壘事件，驗證送來的跑者真的在壘上
import type { SupabaseClient } from '@supabase/supabase-js';
import { RunnerEventInput, checkRunnersOnBases, computeBases } from '@/lib/baserunning';
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
  const { data, error } = await supabase
    .from('runner_events')
    .select('play_id, inning, runner_player_id, from_base, to_base')
    .eq('game_id', gameId)
    .eq('inning', inning)
    // 和比賽頁（games/get）同樣依 created_at 重播；時間相同時用 id 讓順序固定
    .order('created_at')
    .order('id');
  if (error) return isMissingTable(error) ? { kind: 'missing' } : { kind: 'failed', error };
  const invalid = checkRunnersOnBases(runners, computeBases(data ?? [], inning));
  return invalid ? { kind: 'invalid', error: invalid } : { kind: 'ok' };
}
