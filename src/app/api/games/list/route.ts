import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { AtbatResultFields, countPlateAppearances } from '@/lib/atbat';

export async function GET() {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    // 打席數由打席結果計算（不含盜壘/暴投等非打擊跑壘），比賽頁用同一個規則
    const { data: games, error } = await supabase
      .from('games')
      .select('*, atbats(contacted, no_contact, result, out_type)')
      .order('game_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const list = (games || []).map(({ atbats, ...game }) => ({
      ...game,
      pa_count: countPlateAppearances((atbats ?? []) as AtbatResultFields[]),
    }));

    return NextResponse.json({ games: list }, { status: 200 });
  } catch (error) {
    console.error('Error fetching games:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
