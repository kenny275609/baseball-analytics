import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { AtbatResultFields, fieldsToResult, parseAtbatInput } from '@/lib/atbat';
import { autoRbi, batterEventPatch, laterRunnerMoves } from '@/lib/baserunning';
import { isMissingTable, syncGameScore } from '@/lib/score';

async function hasLaterMoves(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batter: { id: string; player_id: string; game_id: string | null; inning: number | null; created_at: string }
): Promise<boolean> {
  if (!batter.game_id || batter.inning === null) return false;
  const [eventsRes, subsRes] = await Promise.all([
    supabase
      .from('runner_events')
      .select('atbat_id, inning, runner_player_id, from_base, created_at')
      .eq('game_id', batter.game_id)
      .eq('inning', batter.inning),
    supabase
      .from('game_substitutions')
      .select('inning, out_player_id, in_player_id, created_at')
      .eq('game_id', batter.game_id)
      .eq('sub_type', 'pinch_runner'),
  ]);
  if (eventsRes.error) throw eventsRes.error;
  if (subsRes.error && !isMissingTable(subsRes.error)) throw subsRes.error;
  return laterRunnerMoves(batter, eventsRes.data ?? [], subsRes.data ?? []) > 0;
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const parsed = parseAtbatInput(body);
    if (!parsed.row) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { data: before, error: beforeError } = await supabase
      .from('atbats')
      .select('contacted, no_contact, result, out_type, rbi, player_id, game_id, inning, created_at')
      .eq('id', body.id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) {
      return NextResponse.json({ error: '找不到這筆打席' }, { status: 404 });
    }

    // 這個打席的跑壘事件（資料表不存在就當作沒有）
    const { data: eventRows, error: eventsReadError } = await supabase
      .from('runner_events')
      .select('id, from_base, to_base')
      .eq('atbat_id', body.id);
    if (eventsReadError && !isMissingTable(eventsReadError)) throw eventsReadError;
    const events = eventsReadError ? [] : eventRows ?? [];

    // 跑壘事件一定要有局數，有跑壘紀錄的打席不能清除局數
    if (events.length > 0 && !parsed.row.inning) {
      return NextResponse.json({ error: '這個打席有跑壘紀錄，局數不能清空' }, { status: 400 });
    }

    const newCode = fieldsToResult(parsed.row as unknown as AtbatResultFields);
    const patch = batterEventPatch(fieldsToResult(before), newCode, events);
    // 只有打者自己的跑壘紀錄時打點可以重算（全壘打改飛球接殺不該留著 1 打點）；使用者自己改過打點就照他填的
    if (patch.kind === 'update' && newCode && parsed.row.rbi === before.rbi) {
      parsed.row.rbi = autoRbi(newCode, [{ from: 0, to: patch.to }]);
    }

    const { data: atbat, error } = await supabase
      .from('atbats')
      .update(parsed.row)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    let warning: string | undefined;
    if (events.length > 0) {
      // 改了局數時，這個打席的跑壘事件跟著移到同一局
      const { error: inningError } = await supabase
        .from('runner_events')
        .update({ inning: atbat.inning })
        .eq('atbat_id', atbat.id)
        .neq('inning', atbat.inning);
      if (inningError) throw inningError;

      // 改了結果時，打者事件跟著新結果走；壘上還有其他跑者時無法自動推算，請使用者重記
      if (patch.kind === 'warn') {
        warning = '這個打席有其他跑者的跑壘紀錄，跑者去向沒有跟著更新；如需修正請刪除打席後重新記錄';
      } else if (patch.kind === 'update') {
        const { error: batterError } = await supabase
          .from('runner_events')
          .update({ to_base: patch.to })
          .eq('id', patch.id);
        if (batterError) throw batterError;
        if (await hasLaterMoves(supabase, { id: body.id, ...before })) {
          warning = '這位打者上壘後還有跑壘紀錄（含代跑、得分），沒有跟著更新，比分和壘包可能對不上；請一併修正後面的紀錄';
        }
      }
    }

    if (atbat.game_id) await syncGameScore(supabase, atbat.game_id);

    return NextResponse.json({ atbat, warning }, { status: 200 });
  } catch (error) {
    console.error('Error updating atbat:', error);
    return NextResponse.json(
      { error: 'Failed to update atbat' },
      { status: 500 }
    );
  }
}
