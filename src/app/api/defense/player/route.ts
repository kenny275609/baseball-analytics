import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isMissingTable } from '@/lib/score';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 球員頁的守備成績：這位球員經手過的防守紀錄，以及有上場守備的每一場比賽。
// 有排守備位置、但整場沒有守備機會的比賽也列出（成績 0），每一場都看得到。
// migration 還沒執行時回 ready: false
export async function GET(request: Request) {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const playerId = new URL(request.url).searchParams.get('player_id');
    if (!playerId || !UUID_RE.test(playerId)) return NextResponse.json({ error: '缺少球員' }, { status: 400 });

    const [playsRes, posRes] = await Promise.all([
      supabase
        .from('defense_plays')
        .select('id, game_id, inning, result, path, path_players, created_at')
        .contains('path_players', [playerId])
        .order('created_at')
        .order('id'),
      supabase.from('game_defense').select('game_id, position').eq('player_id', playerId),
    ]);
    if (isMissingTable(playsRes.error) || isMissingTable(posRes.error)) {
      return NextResponse.json({ ready: false, games: [], plays: [], positions: [] }, { status: 200 });
    }
    if (playsRes.error) throw playsRes.error;
    if (posRes.error) throw posRes.error;

    const plays = playsRes.data;
    const playedIds = new Set(plays.map((p) => p.game_id));
    // 只排了守備位置、沒經手任何紀錄的比賽：那場有記防守才算有上場守備（還沒開始記的比賽不列）
    const onlyPositioned = [...new Set(posRes.data.map((p) => p.game_id))].filter((id) => !playedIds.has(id));
    if (onlyPositioned.length) {
      const { data, error } = await supabase.from('defense_plays').select('game_id').in('game_id', onlyPositioned);
      if (error) throw error;
      for (const row of data) playedIds.add(row.game_id);
    }

    const ids = [...playedIds];
    let games: { id: string; game_date: string; opponent: string; status: string }[] = [];
    if (ids.length) {
      const { data, error } = await supabase
        .from('games')
        .select('id, game_date, opponent, status')
        .in('id', ids)
        .order('game_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      games = data;
    }

    return NextResponse.json(
      {
        ready: true,
        games,
        plays,
        positions: posRes.data.filter((p) => playedIds.has(p.game_id)),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error fetching player fielding:', error);
    return NextResponse.json({ error: '讀取守備成績失敗' }, { status: 500 });
  }
}
