import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    // 打席數直接由資料庫聚合；非打擊的跑壘事件記在 runner_events，本來就不在 atbats 裡
    const { data: games, error } = await supabase
      .from('games')
      .select('*, atbats(count)')
      .order('game_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const list = (games || []).map(({ atbats, ...game }) => ({
      ...game,
      pa_count: (atbats as { count: number }[] | null)?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ games: list }, { status: 200 });
  } catch (error) {
    console.error('Error fetching games:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
