import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const { game_date, opponent, home_away, lineup } = await request.json();

    if (!opponent || typeof opponent !== 'string' || !opponent.trim()) {
      return NextResponse.json({ error: '請輸入對手' }, { status: 400 });
    }
    if (!Array.isArray(lineup) || lineup.length === 0 || lineup.length > 20) {
      return NextResponse.json({ error: '請排定打序（1–20 人）' }, { status: 400 });
    }

    const { data: game, error } = await supabase
      .from('games')
      .insert({
        game_date: game_date || undefined,
        opponent: opponent.trim(),
        home_away: home_away === 'away' ? 'away' : 'home',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const { error: lineupError } = await supabase.from('game_lineups').insert(
      lineup.map((player_id: string, i: number) => ({
        game_id: game.id,
        batting_order: i + 1,
        player_id,
      }))
    );

    if (lineupError) {
      // 打序寫入失敗就把比賽也刪掉，避免留下沒有打序的比賽
      await supabase.from('games').delete().eq('id', game.id);
      throw lineupError;
    }

    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    console.error('Error creating game:', error);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 });
  }
}
