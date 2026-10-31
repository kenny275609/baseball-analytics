import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { syncGameScore } from '@/lib/score';

// 刪除一整個非打擊 play（打席造成的跑壘隨打席一起刪，不從這裡刪）
export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    if (!body.play_id) {
      return NextResponse.json({ error: 'play_id is required' }, { status: 400 });
    }

    const { data: deleted, error } = await supabase
      .from('runner_events')
      .delete()
      .eq('play_id', body.play_id)
      .is('atbat_id', null)
      .select('game_id');

    if (error) throw error;

    const gameId = deleted?.[0]?.game_id;
    if (gameId) await syncGameScore(supabase, gameId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting runner events:', error);
    return NextResponse.json({ error: 'Failed to delete runner events' }, { status: 500 });
  }
}
