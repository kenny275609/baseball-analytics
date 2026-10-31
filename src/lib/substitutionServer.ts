// 伺服器端：寫入換人（換人紀錄 + 打序）與撤銷換人。
// 沒有交易可用：打序一律用「這一棒目前還是畫面上那位球員」當條件更新，
// 兩支手機同時換同一棒時只有一支會成功，另一支撤回自己的換人紀錄並回 409
import type { SupabaseClient } from '@supabase/supabase-js';
import { basesInDb } from '@/lib/basesServer';
import { isUniqueViolation } from '@/lib/idempotency';
import { isMissingTable } from '@/lib/score';
import { Substitution, SubstitutionInput, checkSubstitution } from '@/lib/substitution';

export const SUB_SELECT =
  '*, out_player:players!game_substitutions_out_player_fkey(name, number), in_player:players!game_substitutions_in_player_fkey(name, number)';

export const MIGRATION_ERROR =
  '換人功能需要先在 Supabase 執行 migration 20261103000000_game_substitutions.sql';

type Result =
  | { status: 200 | 201; body: { substitution: Substitution; duplicate?: boolean } }
  | { status: 400 | 404 | 409 | 503; body: { error: string; conflict?: boolean } };

async function findByClientId(supabase: SupabaseClient, gameId: string, clientId: string) {
  const { data, error } = await supabase
    .from('game_substitutions')
    .select(SUB_SELECT)
    .eq('game_id', gameId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data as Substitution | null;
}

export async function createSubstitution(supabase: SupabaseClient, input: SubstitutionInput): Promise<Result> {
  const gameId = input.game_id;

  // 重送（例如逾時後再按一次）：同一個 client_id 已寫入就回傳原本那筆
  if (input.client_id) {
    const { data, error } = await supabase
      .from('game_substitutions')
      .select(SUB_SELECT)
      .eq('client_id', input.client_id)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return { status: 503, body: { error: MIGRATION_ERROR } };
      throw error;
    }
    if (data) {
      if ((data as Substitution).game_id !== gameId) {
        return { status: 409, body: { error: '這筆換人的識別碼已被其他比賽使用' } };
      }
      return { status: 200, body: { substitution: data as Substitution, duplicate: true } };
    }
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, status')
    .eq('id', gameId)
    .maybeSingle();
  if (gameError) throw gameError;
  if (!game) return { status: 404, body: { error: '找不到這場比賽' } };
  if (game.status !== 'live') return { status: 400, body: { error: '比賽已結束，請先重新開啟記錄再換人' } };

  const { data: lineup, error: lineupError } = await supabase
    .from('game_lineups')
    .select('batting_order, player_id')
    .eq('game_id', gameId);
  if (lineupError) throw lineupError;

  let bases = null;
  if (input.sub_type === 'pinch_runner') {
    const replay = await basesInDb(supabase, gameId, input.inning as number);
    if (replay.kind === 'failed') throw replay.error;
    if (replay.kind === 'ok') bases = replay.bases;
  }
  const problem = checkSubstitution(input, lineup ?? [], bases);
  if (problem) return { status: problem.status, body: { error: problem.error, conflict: problem.status === 409 } };

  const { data: inserted, error: insertError } = await supabase
    .from('game_substitutions')
    .insert({
      game_id: gameId,
      client_id: input.client_id,
      sub_type: input.sub_type,
      batting_order: input.batting_order,
      out_player_id: input.out_player_id,
      in_player_id: input.in_player_id,
      inning: input.inning,
      half: input.half,
      base: input.base,
    })
    .select(SUB_SELECT)
    .single();
  if (insertError) {
    if (isMissingTable(insertError)) return { status: 503, body: { error: MIGRATION_ERROR } };
    // 兩個重送請求同時到：回傳先寫入的那一筆
    if (input.client_id && isUniqueViolation(insertError)) {
      const existing = await findByClientId(supabase, gameId, input.client_id);
      if (existing) return { status: 200, body: { substitution: existing, duplicate: true } };
    }
    throw insertError;
  }
  const sub = inserted as Substitution;

  // 打序：加棒次新增一棒；其他換人只在這一棒仍是換下的球員時才更新
  const lineupWrite =
    input.sub_type === 'add_slot'
      ? await supabase
          .from('game_lineups')
          .insert({ game_id: gameId, batting_order: input.batting_order, player_id: input.in_player_id })
          .select('batting_order')
      : await supabase
          .from('game_lineups')
          .update({ player_id: input.in_player_id })
          .eq('game_id', gameId)
          .eq('batting_order', input.batting_order)
          .eq('player_id', input.out_player_id as string)
          .select('batting_order');
  if (lineupWrite.error || !lineupWrite.data?.length) {
    await supabase.from('game_substitutions').delete().eq('id', sub.id);
    if (lineupWrite.error && !isUniqueViolation(lineupWrite.error)) throw lineupWrite.error;
    return {
      status: 409,
      body: { error: `第 ${input.batting_order} 棒剛被其他裝置更動，這次換人沒有寫入，請重新整理後再確認`, conflict: true },
    };
  }

  return { status: 201, body: { substitution: sub } };
}

// 撤銷換人：打序還原成換人之前（加棒次則移除那一棒），再刪掉換人紀錄。
// 呼叫端要先確認這筆換人是整場比賽最後一筆動作
export async function undoSubstitution(
  supabase: SupabaseClient,
  gameId: string,
  subId: string
): Promise<{ ok: true } | { ok: false; status: 403 | 409; error: string }> {
  const { data: sub, error } = await supabase
    .from('game_substitutions')
    .select('id, sub_type, batting_order, out_player_id, in_player_id')
    .eq('game_id', gameId)
    .eq('id', subId)
    .maybeSingle();
  if (error) throw error;
  if (!sub) return { ok: false, status: 409, error: '這筆換人已經被撤銷，請重新整理' };
  if (!sub.in_player_id) return { ok: false, status: 409, error: '換上場的球員已被刪除，無法自動還原打序' };

  const isAdd = sub.sub_type === 'add_slot';
  if (!isAdd && !sub.out_player_id) {
    return { ok: false, status: 409, error: '原本的球員已被刪除，無法還原打序' };
  }
  const restore = isAdd
    ? await supabase
        .from('game_lineups')
        .delete()
        .eq('game_id', gameId)
        .eq('batting_order', sub.batting_order)
        .eq('player_id', sub.in_player_id)
        .select('batting_order')
    : await supabase
        .from('game_lineups')
        .update({ player_id: sub.out_player_id })
        .eq('game_id', gameId)
        .eq('batting_order', sub.batting_order)
        .eq('player_id', sub.in_player_id)
        .select('batting_order');
  if (restore.error) throw restore.error;
  if (!restore.data?.length) {
    return { ok: false, status: 409, error: `第 ${sub.batting_order} 棒已經不是換上場的球員，無法撤銷這次換人，請重新整理` };
  }

  const { data: deleted, error: delError } = await supabase
    .from('game_substitutions')
    .delete()
    .eq('game_id', gameId)
    .eq('id', subId)
    .select('id');
  if (delError || !deleted?.length) {
    // 換人紀錄刪不掉（例如沒有權限）：把打序改回去，維持一致
    if (isAdd) {
      await supabase
        .from('game_lineups')
        .insert({ game_id: gameId, batting_order: sub.batting_order, player_id: sub.in_player_id });
    } else {
      await supabase
        .from('game_lineups')
        .update({ player_id: sub.in_player_id })
        .eq('game_id', gameId)
        .eq('batting_order', sub.batting_order)
        .eq('player_id', sub.out_player_id);
    }
    if (delError) throw delError;
    return { ok: false, status: 403, error: '無法撤銷這次換人（可能沒有權限）' };
  }
  return { ok: true };
}
