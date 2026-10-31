import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';

// 更新比賽資訊（狀態、對手、比分…）
export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // 換人改由 /api/games/substitute（保留換人紀錄），這裡不再直接覆寫打序
    if (body.lineup_slot) {
      return NextResponse.json({ error: '請使用比賽頁的「換人」功能' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.status === 'live' || body.status === 'final') updates.status = body.status;
    if (typeof body.opponent === 'string' && body.opponent.trim()) updates.opponent = body.opponent.trim();
    if (body.home_away === 'home' || body.home_away === 'away') updates.home_away = body.home_away;
    if (typeof body.game_date === 'string' && body.game_date) updates.game_date = body.game_date;
    for (const key of ['our_score', 'opp_score'] as const) {
      if (key in body) {
        const n = body[key] === null || body[key] === '' ? null : Number(body[key]);
        updates[key] = n === null || (Number.isInteger(n) && n >= 0) ? n : null;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('games').update(updates).eq('id', id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error updating game:', error);
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
  }
}
