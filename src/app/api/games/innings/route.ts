import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isMissingTable, syncGameScore } from '@/lib/score';

// 設定對手某一局的得分；opp_runs 為空字串或 null 時清除該局
export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    const inning = Number(body.inning);
    if (!body.game_id || !Number.isInteger(inning) || inning < 1 || inning > 30) {
      return NextResponse.json({ error: '缺少比賽或局數' }, { status: 400 });
    }

    const clear = body.opp_runs === null || body.opp_runs === '';
    const runs = Number(body.opp_runs);
    if (!clear && (!Number.isInteger(runs) || runs < 0 || runs > 99)) {
      return NextResponse.json({ error: '得分需為 0-99 的整數' }, { status: 400 });
    }

    const { error } = clear
      ? await supabase.from('game_innings').delete().eq('game_id', body.game_id).eq('inning', inning)
      : await supabase.from('game_innings').upsert({ game_id: body.game_id, inning, opp_runs: runs });

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ error: '每局得分資料表尚未建立，請先執行 migration' }, { status: 503 });
      }
      throw error;
    }

    await syncGameScore(supabase, body.game_id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error updating inning score:', error);
    return NextResponse.json({ error: 'Failed to update inning score' }, { status: 500 });
  }
}
