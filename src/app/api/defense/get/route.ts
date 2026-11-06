import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isMissingTable } from '@/lib/score';

// 防守頁資料：守備位置、防守紀錄，以及會在比賽頁被改動的比賽狀態、對手每局得分與目前打序（防守頁定時同步用）。
// migration 還沒執行時回 ready: false
export async function GET(request: Request) {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const gameId = new URL(request.url).searchParams.get('game_id');
    if (!gameId) return NextResponse.json({ error: '缺少比賽' }, { status: 400 });

    const [gameRes, posRes, playsRes, inningsRes, lineupRes] = await Promise.all([
      supabase.from('games').select('status').eq('id', gameId).maybeSingle(),
      supabase.from('game_defense').select('position, player_id').eq('game_id', gameId).order('position'),
      supabase
        .from('defense_plays')
        .select('id, inning, result, path, path_players, created_at')
        .eq('game_id', gameId)
        .order('created_at')
        .order('id'),
      supabase.from('game_innings').select('inning, opp_runs').eq('game_id', gameId).order('inning'),
      supabase.from('game_lineups').select('player_id').eq('game_id', gameId).order('batting_order'),
    ]);
    if (gameRes.error) throw gameRes.error;
    if (!gameRes.data) return NextResponse.json({ error: '找不到這場比賽' }, { status: 404 });
    const status = gameRes.data.status;
    if (inningsRes.error && !isMissingTable(inningsRes.error)) throw inningsRes.error;
    if (lineupRes.error) throw lineupRes.error;
    const innings = inningsRes.data ?? [];
    const lineup = lineupRes.data.map((l) => l.player_id);

    if (isMissingTable(posRes.error) || isMissingTable(playsRes.error)) {
      return NextResponse.json({ ready: false, status, positions: [], plays: [], innings, lineup }, { status: 200 });
    }
    if (posRes.error) throw posRes.error;
    if (playsRes.error) throw playsRes.error;

    return NextResponse.json(
      { ready: true, status, positions: posRes.data, plays: playsRes.data, innings, lineup },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error fetching defense:', error);
    return NextResponse.json({ error: '讀取防守紀錄失敗' }, { status: 500 });
  }
}
