import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isMissingTable } from '@/lib/score';
import { SUB_SELECT } from '@/lib/substitutionServer';

export async function GET(request: Request) {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const [gameRes, lineupRes, atbatsRes, eventsRes, inningsRes, subsRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', id).single(),
      supabase
        .from('game_lineups')
        .select('batting_order, player_id, players(name, number)')
        .eq('game_id', id)
        .order('batting_order'),
      supabase
        .from('atbats')
        .select('*, players(name, number)')
        .eq('game_id', id)
        .order('created_at')
        .order('id'),
      supabase
        .from('runner_events')
        .select('*, players(name, number)')
        .eq('game_id', id)
        // 和伺服器端驗證（basesServer）同樣的重播順序
        .order('created_at')
        .order('id'),
      supabase.from('game_innings').select('inning, opp_runs').eq('game_id', id).order('inning'),
      supabase.from('game_substitutions').select(SUB_SELECT).eq('game_id', id).order('created_at').order('id'),
    ]);

    if (gameRes.error) {
      if (gameRes.error.code === 'PGRST116') {
        return NextResponse.json({ error: '找不到這場比賽' }, { status: 404 });
      }
      throw gameRes.error;
    }
    if (lineupRes.error) throw lineupRes.error;
    if (atbatsRes.error) throw atbatsRes.error;
    // migration 還沒執行時當作沒有跑壘資料，頁面照常顯示
    if (eventsRes.error && !isMissingTable(eventsRes.error)) throw eventsRes.error;
    if (inningsRes.error && !isMissingTable(inningsRes.error)) throw inningsRes.error;
    // 換人的 migration 還沒執行（或讀取失敗）：比賽頁照常顯示，只是停用換人並提示
    if (subsRes.error && !isMissingTable(subsRes.error)) console.error('Error fetching substitutions:', subsRes.error);

    return NextResponse.json(
      {
        game: gameRes.data,
        lineup: lineupRes.data,
        atbats: atbatsRes.data,
        runner_events: eventsRes.data ?? [],
        innings: inningsRes.data ?? [],
        substitutions: subsRes.error ? [] : subsRes.data ?? [],
        substitutions_ready: !subsRes.error,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json({ error: 'Failed to fetch game' }, { status: 500 });
  }
}
