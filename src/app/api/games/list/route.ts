import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await authorize();
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const { data: games, error } = await supabase
      .from('games')
      .select('*, atbats(count)')
      .order('game_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ games: games || [] }, { status: 200 });
  } catch (error) {
    console.error('Error fetching games:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
