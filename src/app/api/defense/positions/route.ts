import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isMissingTable } from '@/lib/score';
import { isUuid } from '@/lib/baserunning';
import { MAX_POSITION } from '@/lib/defense';

// 設定某個守備位置的球員；player_id 為 null 時清空這個位置。
// 這位球員原本守別的位置時會從那個位置移走（一人只守一個位置）
export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json().catch(() => null);
    const position = body?.position;
    if (!isUuid(body?.game_id) || !Number.isInteger(position) || position < 1 || position > MAX_POSITION) {
      return NextResponse.json({ error: '缺少比賽或守備位置' }, { status: 400 });
    }
    const playerId = body.player_id ?? null;
    if (playerId !== null && !isUuid(playerId)) {
      return NextResponse.json({ error: '球員錯誤' }, { status: 400 });
    }

    const { error: clearError } = await supabase
      .from('game_defense')
      .delete()
      .eq('game_id', body.game_id)
      .or(playerId ? `position.eq.${position},player_id.eq.${playerId}` : `position.eq.${position}`);
    if (clearError) {
      if (isMissingTable(clearError)) {
        return NextResponse.json({ error: '防守紀錄尚未啟用，請先執行 migration' }, { status: 503 });
      }
      throw clearError;
    }

    if (playerId) {
      const { error } = await supabase
        .from('game_defense')
        .insert({ game_id: body.game_id, position, player_id: playerId });
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: '另一支手機剛改過守備位置，請重新整理' }, { status: 409 });
        }
        throw error;
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error setting defense position:', error);
    return NextResponse.json({ error: '設定守備位置失敗' }, { status: 500 });
  }
}
