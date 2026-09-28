import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('player');

    let query = supabase
      .from('atbats')
      .select('*, players(name, number), games(game_date, opponent)')
      .order('created_at', { ascending: false });

    if (playerId) {
      query = query.eq('player_id', playerId);
    }

    const gameId = searchParams.get('game');
    if (gameId) {
      query = query.eq('game_id', gameId);
    }

    const { data: atbats, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ atbats }, { status: 200 });
  } catch (error) {
    console.error('Error fetching atbats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch atbats' },
      { status: 500 }
    );
  }
}



