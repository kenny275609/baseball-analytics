import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isMissingTable } from '@/lib/score';
import { isUuid } from '@/lib/baserunning';
import { MAX_POSITION } from '@/lib/defense';

// 打序或守備位置裡有剛被刪除的球員（外鍵錯誤）
const deletedPlayer = () => NextResponse.json({ error: '有球員已被刪除，請重新整理後再試' }, { status: 400 });

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: '資料格式錯誤' }, { status: 400 });
    const { game_date, opponent, home_away, lineup, positions = [] } = body;

    if (!opponent || typeof opponent !== 'string' || !opponent.trim()) {
      return NextResponse.json({ error: '請輸入對手' }, { status: 400 });
    }
    if (!Array.isArray(lineup) || lineup.length === 0 || lineup.length > 20 || !lineup.every(isUuid)) {
      return NextResponse.json({ error: '請排定打序（1–20 人）' }, { status: 400 });
    }
    // 一位球員只能排一個棒次（資料庫 game_lineups(game_id, player_id) 也有唯一索引）
    if (new Set(lineup).size !== lineup.length) {
      return NextResponse.json({ error: '同一位球員不能排在兩個棒次' }, { status: 400 });
    }

    // 開賽前排好的守備位置（可以不排，之後到防守頁再排）：[{ position, player_id }]
    if (
      !Array.isArray(positions) ||
      positions.some(
        (p) => !Number.isInteger(p?.position) || p.position < 1 || p.position > MAX_POSITION || !isUuid(p?.player_id),
      )
    ) {
      return NextResponse.json({ error: '守備位置錯誤' }, { status: 400 });
    }
    if (
      new Set(positions.map((p) => p.position)).size !== positions.length ||
      new Set(positions.map((p) => p.player_id)).size !== positions.length
    ) {
      return NextResponse.json({ error: '同一個位置只能排一人，一人也只能守一個位置' }, { status: 400 });
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
      if (lineupError.code === '23503') return deletedPlayer();
      throw lineupError;
    }

    if (positions.length > 0) {
      const { error: defenseError } = await supabase.from('game_defense').insert(
        positions.map((p: { position: number; player_id: string }) => ({
          game_id: game.id,
          position: p.position,
          player_id: p.player_id,
        })),
      );
      // 防守的 migration 還沒執行時只略過守備位置，比賽照常建立
      if (defenseError && !isMissingTable(defenseError)) {
        await supabase.from('games').delete().eq('id', game.id);
        if (defenseError.code === '23503') return deletedPlayer();
        throw defenseError;
      }
    }

    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    console.error('Error creating game:', error);
    return NextResponse.json({ error: '建立比賽失敗' }, { status: 500 });
  }
}
