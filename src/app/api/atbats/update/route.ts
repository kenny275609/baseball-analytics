import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { parseAtbatInput } from '@/lib/atbat';
import { isMissingTable } from '@/lib/score';

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
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
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

    // 改了局數時，這個打席的跑壘事件跟著移到同一局（資料表不存在就略過）
    if (atbat.inning && atbat.game_id) {
      const { error: eventsError } = await supabase
        .from('runner_events')
        .update({ inning: atbat.inning })
        .eq('atbat_id', atbat.id)
        .neq('inning', atbat.inning);
      if (eventsError && !isMissingTable(eventsError)) throw eventsError;
    }

    return NextResponse.json({ atbat }, { status: 200 });
  } catch (error) {
    console.error('Error updating atbat:', error);
    return NextResponse.json(
      { error: 'Failed to update atbat' },
      { status: 500 }
    );
  }
}
