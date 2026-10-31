// 伺服器端：依跑壘事件與對手每局得分同步 games.our_score / opp_score
import type { SupabaseClient } from '@supabase/supabase-js';
import { isTracked } from '@/lib/baserunning';

// migration 還沒執行時資料表不存在：42P01（Postgres）/ PGRST205（PostgREST schema cache）
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

// 要寫回 games 的比分欄位；空物件表示不用更新
export function scoreUpdates(
  atbats: { id: string }[],
  events: { atbat_id: string | null; to_base: number | null }[],
  innings: { opp_runs: number | null }[]
): { our_score?: number | null; opp_score?: number | null } {
  const oppRuns = innings.reduce((sum, i) => sum + (i.opp_runs ?? 0), 0);
  const nothingYet = atbats.length === 0 && events.length === 0 && innings.length === 0;

  if (isTracked(atbats, events)) {
    return {
      our_score: nothingYet ? null : events.filter((e) => e.to_base === 4).length,
      opp_score: nothingYet ? null : oppRuns,
    };
  }
  // 舊比賽（或混有舊打席）：我方比分維持手動，對手有填每局得分才同步
  return innings.length > 0 ? { opp_score: oppRuns } : {};
}

export async function syncGameScore(supabase: SupabaseClient, gameId: string): Promise<void> {
  try {
    const [atbatsRes, eventsRes, inningsRes] = await Promise.all([
      supabase.from('atbats').select('id').eq('game_id', gameId),
      supabase.from('runner_events').select('atbat_id, to_base').eq('game_id', gameId),
      supabase.from('game_innings').select('opp_runs').eq('game_id', gameId),
    ]);
    if (atbatsRes.error || eventsRes.error || inningsRes.error) return;

    const updates = scoreUpdates(atbatsRes.data ?? [], eventsRes.data ?? [], inningsRes.data ?? []);
    if (Object.keys(updates).length > 0) {
      await supabase.from('games').update(updates).eq('id', gameId);
    }
  } catch (error) {
    // 比分同步失敗不影響主要操作，下次寫入會再同步
    console.error('Error syncing game score:', error);
  }
}
