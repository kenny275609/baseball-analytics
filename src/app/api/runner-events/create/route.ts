import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isStandaloneType, isUuid, parseRunnerInputs } from '@/lib/baserunning';
import { isMissingTable, syncGameScore } from '@/lib/score';

// 兩個打席之間的跑壘（盜壘、暴投、捕逸、牽制…），同一次送出的跑者算同一個 play
export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    const inning = Number(body.inning);
    if (!isUuid(body.game_id) || !Number.isInteger(inning) || inning < 1 || inning > 30) {
      return NextResponse.json({ error: '缺少比賽或局數' }, { status: 400 });
    }
    if (!isStandaloneType(body.event_type)) {
      return NextResponse.json({ error: '請選擇跑壘事件' }, { status: 400 });
    }
    const runners = parseRunnerInputs(body.runners, false);
    if (!runners) {
      return NextResponse.json({ error: '跑壘資料錯誤' }, { status: 400 });
    }
    if (runners.length === 0) {
      return NextResponse.json({ error: '沒有跑者移動' }, { status: 400 });
    }

    const playId = crypto.randomUUID();
    const { data, error } = await supabase
      .from('runner_events')
      .insert(
        runners.map((r) => ({
          ...r,
          event_type: body.event_type,
          game_id: body.game_id,
          atbat_id: null,
          play_id: playId,
          inning,
        }))
      )
      .select('*, players(name, number)');

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ error: '跑壘資料表尚未建立，請先執行 migration' }, { status: 503 });
      }
      throw error;
    }

    await syncGameScore(supabase, body.game_id);

    return NextResponse.json({ runner_events: data }, { status: 201 });
  } catch (error) {
    console.error('Error creating runner events:', error);
    return NextResponse.json({ error: 'Failed to create runner events' }, { status: 500 });
  }
}
