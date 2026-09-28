import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const [gameRes, lineupRes, atbatsRes] = await Promise.all([
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
        .order('created_at'),
    ]);

    if (gameRes.error) {
      if (gameRes.error.code === 'PGRST116') {
        return NextResponse.json({ error: '找不到這場比賽' }, { status: 404 });
      }
      throw gameRes.error;
    }
    if (lineupRes.error) throw lineupRes.error;
    if (atbatsRes.error) throw atbatsRes.error;

    return NextResponse.json(
      { game: gameRes.data, lineup: lineupRes.data, atbats: atbatsRes.data },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json({ error: 'Failed to fetch game' }, { status: 500 });
  }
}
