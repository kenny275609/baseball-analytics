import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorize } from '@/lib/auth';
import { parseAtbatInput } from '@/lib/atbat';

export async function POST(request: Request) {
  try {
    const auth = await authorize(['editor', 'admin']);
    if (auth.error) return auth.error;
    const supabase = await createClient();

    const body = await request.json();
    if (!body.player_id || !body.game_id) {
      return NextResponse.json({ error: '缺少球員或比賽' }, { status: 400 });
    }

    const parsed = parseAtbatInput(body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { data: atbat, error } = await supabase
      .from('atbats')
      .insert({ ...parsed.row, player_id: body.player_id, game_id: body.game_id })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ atbat }, { status: 201 });
  } catch (error) {
    console.error('Error creating atbat:', error);
    return NextResponse.json(
      { error: 'Failed to create atbat' },
      { status: 500 }
    );
  }
}
