// 伺服器端：離線同步重送時的去重。前端每筆動作帶 client_id，伺服器拿來當 play_id，
// 重送時先查這個 play_id 有沒有寫過，有就回傳原本的資料
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/baserunning';
import { isMissingTable } from '@/lib/score';

export type ExistingPlay =
  | { kind: 'none' }
  | { kind: 'atbat'; atbat: Record<string, unknown>; events: Record<string, unknown>[] }
  | { kind: 'play'; events: Record<string, unknown>[] };

// undefined / null = 沒帶（舊版前端），格式錯誤回傳 false
export function parseClientId(value: unknown): string | null | false {
  if (value === undefined || value === null) return null;
  return isUuid(value) ? value : false;
}

// unique index (play_id, from_base) 擋下的重複寫入
export function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

export async function findExistingPlay(
  supabase: SupabaseClient,
  gameId: string,
  playId: string
): Promise<ExistingPlay> {
  const { data: events, error } = await supabase
    .from('runner_events')
    .select('*, players(name, number)')
    .eq('game_id', gameId)
    .eq('play_id', playId)
    .order('created_at')
    .order('id');
  if (error) {
    if (isMissingTable(error)) return { kind: 'none' };
    throw error;
  }
  if (!events || events.length === 0) return { kind: 'none' };
  const atbatId = events[0].atbat_id as string | null;
  if (!atbatId) return { kind: 'play', events };
  const { data: atbat, error: atbatError } = await supabase
    .from('atbats')
    .select('*, players(name, number)')
    .eq('id', atbatId)
    .maybeSingle();
  if (atbatError) throw atbatError;
  // 打席已被刪除時事件也會一起刪（CASCADE），理論上不會走到這裡
  if (!atbat) return { kind: 'none' };
  return { kind: 'atbat', atbat, events };
}
