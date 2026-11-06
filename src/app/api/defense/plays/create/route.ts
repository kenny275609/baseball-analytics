import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { isMissingTable } from '@/lib/score';
import { parseDefenseInput } from '@/lib/defense';

const SELECT = 'id, inning, result, path, path_players, created_at';

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const parsed = parseDefenseInput(await request.json().catch(() => null));
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const [gameRes, posRes] = await Promise.all([
      supabase.from('games').select('status').eq('id', input.game_id).single(),
      supabase.from('game_defense').select('position, player_id').eq('game_id', input.game_id),
    ]);
    if (gameRes.error) {
      if (gameRes.error.code === 'PGRST116') return NextResponse.json({ error: '找不到這場比賽' }, { status: 404 });
      throw gameRes.error;
    }
    if (gameRes.data.status !== 'live') {
      return NextResponse.json({ error: '比賽已結束，不能再新增紀錄' }, { status: 409 });
    }
    if (posRes.error) {
      if (isMissingTable(posRes.error)) {
        return NextResponse.json({ error: '防守紀錄尚未啟用，請先執行 migration' }, { status: 503 });
      }
      throw posRes.error;
    }

    // 記下當下各位置上的球員，之後換位置不影響已記錄的刺殺 / 助殺
    const byPos = new Map(posRes.data.map((p) => [p.position, p.player_id]));
    const row = {
      game_id: input.game_id,
      client_id: input.client_id,
      inning: input.inning,
      result: input.result,
      path: input.path,
      path_players: input.path.map((p) => byPos.get(p) ?? null),
    };

    const { data, error } = await supabase.from('defense_plays').insert(row).select(SELECT).single();
    if (error) {
      // 同一筆重送：回傳已存在的那筆
      if (error.code === '23505' && input.client_id) {
        const { data: existing } = await supabase
          .from('defense_plays')
          .select(SELECT)
          .eq('client_id', input.client_id)
          .eq('game_id', input.game_id)
          .maybeSingle();
        if (existing) return NextResponse.json({ play: existing }, { status: 200 });
      }
      if (isMissingTable(error)) {
        return NextResponse.json({ error: '防守紀錄尚未啟用，請先執行 migration' }, { status: 503 });
      }
      throw error;
    }

    return NextResponse.json({ play: data }, { status: 201 });
  } catch (error) {
    console.error('Error creating defense play:', error);
    return NextResponse.json({ error: '記錄失敗' }, { status: 500 });
  }
}
