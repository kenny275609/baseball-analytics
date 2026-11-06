import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isMissingTable } from '@/lib/score';

// 防守頁資料：守備位置與防守紀錄。migration 還沒執行時回 ready: false
export async function GET(request: Request) {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const gameId = new URL(request.url).searchParams.get('game_id');
    if (!gameId) return NextResponse.json({ error: '缺少比賽' }, { status: 400 });

    const [posRes, playsRes] = await Promise.all([
      supabase.from('game_defense').select('position, player_id').eq('game_id', gameId).order('position'),
      supabase
        .from('defense_plays')
        .select('id, inning, result, path, path_players, created_at')
        .eq('game_id', gameId)
        .order('created_at')
        .order('id'),
    ]);

    if (isMissingTable(posRes.error) || isMissingTable(playsRes.error)) {
      return NextResponse.json({ ready: false, positions: [], plays: [] }, { status: 200 });
    }
    if (posRes.error) throw posRes.error;
    if (playsRes.error) throw playsRes.error;

    return NextResponse.json({ ready: true, positions: posRes.data, plays: playsRes.data }, { status: 200 });
  } catch (error) {
    console.error('Error fetching defense:', error);
    return NextResponse.json({ error: '讀取防守紀錄失敗' }, { status: 500 });
  }
}
