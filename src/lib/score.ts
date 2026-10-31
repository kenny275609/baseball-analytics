// 伺服器端：依跑壘事件與對手每局得分同步 games.our_score / opp_score
import type { SupabaseClient } from '@supabase/supabase-js';
import { isTracked } from '@/lib/baserunning';

// migration 還沒執行時資料表不存在：42P01（Postgres）/ PGRST205（PostgREST schema cache）
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export async function syncGameScore(supabase: SupabaseClient, gameId: string): Promise<void> {
  try {
    const [atbatsRes, eventsRes, inningsRes] = await Promise.all([
      supabase.from('atbats').select('id').eq('game_id', gameId),
      supabase.from('runner_events').select('atbat_id, to_base').eq('game_id', gameId),
      supabase.from('game_innings').select('opp_runs').eq('game_id', gameId),
    ]);
    if (atbatsRes.error || eventsRes.error || inningsRes.error) return;

    const atbats = atbatsRes.data ?? [];
    const events = eventsRes.data ?? [];
    const innings = inningsRes.data ?? [];
    const oppRuns = innings.reduce((sum, i) => sum + (i.opp_runs ?? 0), 0);
    const nothingYet = atbats.length === 0 && events.length === 0 && innings.length === 0;

    const updates: Record<string, number | null> = {};
    if (isTracked(atbats, events)) {
      updates.our_score = nothingYet ? null : events.filter((e) => e.to_base === 4).length;
      updates.opp_score = nothingYet ? null : oppRuns;
    } else if (innings.length > 0) {
      // 舊比賽（或混有舊打席）：我方比分維持手動，對手有填每局得分才同步
      updates.opp_score = oppRuns;
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('games').update(updates).eq('id', gameId);
    }
  } catch (error) {
    // 比分同步失敗不影響主要操作，下次寫入會再同步
    console.error('Error syncing game score:', error);
  }
}
