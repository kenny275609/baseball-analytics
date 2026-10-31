import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { fieldsToResult, parseAtbatInput } from '@/lib/atbat';
import { batterEventPatch } from '@/lib/baserunning';
import { isMissingTable, syncGameScore } from '@/lib/score';

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
      .select('contacted, no_contact, result, out_type')
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
      const patch = batterEventPatch(fieldsToResult(before), fieldsToResult(atbat), events);
      if (patch.kind === 'warn') {
        warning = '這個打席有其他跑者的跑壘紀錄，跑者去向沒有跟著更新；如需修正請刪除打席後重新記錄';
      } else if (patch.kind === 'update') {
        const { error: batterError } = await supabase
          .from('runner_events')
          .update({ to_base: patch.to })
          .eq('id', patch.id);
        if (batterError) throw batterError;
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
